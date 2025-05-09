import { Plugin, MarkdownView, Notice, PluginSettingTab, App, Setting, Editor } from 'obsidian';
import { parse, Store, serialize } from '@sergek-research/pttjs';
import { CellItem } from '@sergek-research/pttjs/dist/parser';

interface CellItemWithIndex extends CellItem {
	indexString: string;
}

// Интерфейс для настроек плагина
interface PTTJSPluginSettings {
	showHeaders: boolean;
	showIndices: boolean;
	enableEditing: boolean;
}

// Значения настроек по умолчанию
const DEFAULT_SETTINGS: PTTJSPluginSettings = {
	showHeaders: false,
	showIndices: false,
	enableEditing: true
}

interface IgnoreRowCell { [key: string]: number[] }

function addIgnoreRowCellItem(indexCell: number, indexRow: number, ignoreObj: IgnoreRowCell) {
	if (!Array.isArray(ignoreObj[`r${indexRow}`])) {
		ignoreObj[`r${indexRow}`] = [];
	}
	ignoreObj[`r${indexRow}`].push(indexCell);
}

export default class PTTJSPlugin extends Plugin {
	settings: PTTJSPluginSettings;
	currentEditor: Editor | null = null;
	currentSourcePosition: { start: number, end: number } | null = null;
	currentPTTJSData: Store | null = null;

	async onload() {
		await this.loadSettings();

		// Регистрация постпроцессора для обработки блоков кода с языком pttjs
		this.registerMarkdownCodeBlockProcessor('pttjs', async (source, el, ctx) => {
			try {
				// Получаем редактор текущего представления
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					this.currentEditor = view.editor;

					// Находим позиции блока кода в исходном тексте
					const fullText = view.editor.getValue();
					const codeBlockRegex = /```pttjs\n([\s\S]*?)```/g;
					let match;
					let found = false;

					while ((match = codeBlockRegex.exec(fullText)) !== null) {
						if (match[1].trim() === source.trim()) {
							this.currentSourcePosition = {
								start: match.index,
								end: match.index + match[0].length
							};
							found = true;
							break;
						}
					}

					if (!found) {
						this.currentSourcePosition = null;
					}
				}

				const pttjsData = await parse(source);
				this.currentPTTJSData = pttjsData;
				this.renderPTTJSTable(pttjsData, el, source);
			} catch (error) {
				console.error('PTTJS parse error:', error);
				el.createEl('p', { text: 'Error parsing PTTJS: ' + error.message });
			}
		});

		// Добавление пункта меню настроек
		this.addSettingTab(new PTTJSSettingTab(this.app, this));

		// Добавление записи в лог
		console.log('PTTJS plugin loaded');
	}

	onunload() {
		console.log('PTTJS plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Обновление исходного текста PTTJS в редакторе
	updateSourceText(newSource: string) {
		if (this.currentEditor && this.currentSourcePosition) {
			const { start, end } = this.currentSourcePosition;
			const currentText = this.currentEditor.getValue();
			const newText = currentText.substring(0, start) 
				+ "```pttjs\n" + newSource + "\n```" 
				+ currentText.substring(end);
			
			this.currentEditor.setValue(newText);
			new Notice('PTTJS таблица обновлена');
		}
	}

	// Получение ячейки из Store по indexString
	getCellByIndexString(indexString: string): { 
		pageId: string, 
		cell: CellItem, 
		rowIndex: number, 
		cellIndex: number 
	} | null {
		if (!this.currentPTTJSData) return null;

		const [cellIndex, rowIndex] = indexString.split(';').map(Number);
		
		for (const pageId in this.currentPTTJSData.data) {
			const page = this.currentPTTJSData.data[pageId];
			if (page.rows && page.rows[rowIndex] && page.rows[rowIndex][cellIndex]) {
				return {
					pageId,
					cell: page.rows[rowIndex][cellIndex],
					rowIndex,
					cellIndex
				};
			}
		}
		
		return null;
	}

	// Обновление ячейки в Store
	updateCell(indexString: string, newValue: string) {
		const cellInfo = this.getCellByIndexString(indexString);
		if (!cellInfo || !this.currentPTTJSData) return;

		const { pageId, rowIndex, cellIndex } = cellInfo;
		
		// Обновляем значение ячейки
		this.currentPTTJSData.data[pageId].rows[rowIndex][cellIndex].value = newValue;
		
		// Сериализуем обновленную Store обратно в текст
		serialize(this.currentPTTJSData).then((newSource) => { this.updateSourceText(newSource); });
	}

	// Добавление новой строки в таблицу
	addRow(pageId: string, afterRowIndex: number) {
		if (!this.currentPTTJSData) return;
		
		const page = this.currentPTTJSData.data[pageId];
		if (!page.rows) return;
		
		// Определяем количество ячеек в новой строке
		const cellsCount = page.rows.length > 0 ? page.rows[0].length : 1;
		
		// Создаем новую строку с пустыми ячейками
		const newRow: CellItem[] = Array(cellsCount).fill(null).map((_, i) => ({
			id: `cell_${Date.now()}_${i}`,
			value: '',
			scale: [1, 1],
			index: i,
			isHeader: false
		}));
		
		// Вставляем новую строку после указанной
		page.rows.splice(afterRowIndex + 1, 0, newRow);
		
		// Сериализуем обновленную Store обратно в текст
		serialize(this.currentPTTJSData).then((newSource) => { this.updateSourceText(newSource); });
	}

	// Добавление нового столбца в таблицу
	addColumn(pageId: string, afterColumnIndex: number) {
		if (!this.currentPTTJSData) return;
		
		const page = this.currentPTTJSData.data[pageId];
		if (!page.rows) return;
		
		// Добавляем новую ячейку в каждую строку после указанного индекса
		page.rows.forEach((row, rowIndex) => {
			const newCell: CellItem = {
				id: `cell_${Date.now()}_${rowIndex}`,
				value: '',
				scale: [1, 1],
				index: afterColumnIndex + 1,
				isHeader: rowIndex === 0 && row[0]?.isHeader // Наследуем свойство заголовка из первой ячейки строки
			};
			
			row.splice(afterColumnIndex + 1, 0, newCell);
		});
		
		// Сериализуем обновленную Store обратно в текст
		serialize(this.currentPTTJSData).then((newSource) => { this.updateSourceText(newSource); });
	}

	// Объединение ячеек
	mergeCells(startIndexString: string, endIndexString: string) {
		if (!this.currentPTTJSData) return;
		
		const startCell = this.getCellByIndexString(startIndexString);
		const endCell = this.getCellByIndexString(endIndexString);
		
		if (!startCell || !endCell || startCell.pageId !== endCell.pageId) return;
		
		const { pageId } = startCell;
		const startRow = Math.min(startCell.rowIndex, endCell.rowIndex);
		const endRow = Math.max(startCell.rowIndex, endCell.rowIndex);
		const startCol = Math.min(startCell.cellIndex, endCell.cellIndex);
		const endCol = Math.max(startCell.cellIndex, endCell.cellIndex);
		
		// Количество объединяемых строк и столбцов
		const rowSpan = endRow - startRow + 1;
		const colSpan = endCol - startCol + 1;
		
		// Обновляем масштаб начальной ячейки
		const cell = this.currentPTTJSData.data[pageId].rows[startRow][startCol];
		cell.scale = [colSpan, rowSpan];
		
		// Помечаем остальные ячейки в области объединения как пустые
		for (let r = startRow; r <= endRow; r++) {
			for (let c = startCol; c <= endCol; c++) {
				if (r === startRow && c === startCol) continue; // Пропускаем начальную ячейку
				
				// Удаляем содержимое ячейки, но сохраняем её в структуре
				const emptyCell = this.currentPTTJSData.data[pageId].rows[r][c];
				emptyCell.value = '';
				emptyCell.scale = [0, 0]; // Маркируем как часть объединенной ячейки
			}
		}
		
		// Сериализуем обновленную Store обратно в текст
		serialize(this.currentPTTJSData).then((newSource) => { this.updateSourceText(newSource); });
	}

	// Разделение объединенной ячейки
	splitCell(indexString: string) {
		const cellInfo = this.getCellByIndexString(indexString);
		if (!cellInfo || !this.currentPTTJSData) return;
		
		const { pageId, cell, rowIndex, cellIndex } = cellInfo;
		
		if (!Array.isArray(cell.scale) || cell.scale.length < 2 || (cell.scale[0] <= 1 && cell.scale[1] <= 1)) {
			// Ячейка не объединена
			return;
		}
		
		const [colSpan, rowSpan] = cell.scale;
		
		// Сбрасываем масштаб этой ячейки
		cell.scale = [1, 1];
		
		// Восстанавливаем ячейки, которые были частью объединения
		for (let r = rowIndex; r < rowIndex + rowSpan; r++) {
			for (let c = cellIndex; c < cellIndex + colSpan; c++) {
				if (r === rowIndex && c === cellIndex) continue; // Пропускаем исходную ячейку
				
				// Восстанавливаем ячейку
				if (this.currentPTTJSData.data[pageId].rows[r] && this.currentPTTJSData.data[pageId].rows[r][c]) {
					const restoredCell = this.currentPTTJSData.data[pageId].rows[r][c];
					restoredCell.scale = [1, 1];
					restoredCell.value = ''; // Пустое значение для восстановленных ячеек
				}
			}
		}
		
		// Сериализуем обновленную Store обратно в текст
		serialize(this.currentPTTJSData).then((newSource) => { this.updateSourceText(newSource); });
	}

	// Рендеринг таблицы PTTJS
	renderPTTJSTable(pttjsData: Store, containerEl: HTMLElement, sourceText: string) {
		// Создаем контейнер для таблиц PTTJS
		const pttjsContainer = containerEl.createDiv({ cls: 'pttjs-container' });

		const pagesCount = Object.keys(pttjsData.data).length;

		// Для каждой страницы (листа) в данных PTTJS
		for (const pageId in pttjsData.data) {
			const page = pttjsData.data[pageId];
			const { title, rows } = page;
			let normalizedRows: CellItemWithIndex[][] = [];

			// Создаем контейнер для отдельного листа
			const pageContainer = pttjsContainer.createDiv({ cls: 'pttjs-page' });
			
			// Добавляем заголовок листа, если он есть
			if (title && (this.settings.showHeaders || pagesCount > 1)) {
				pageContainer.createEl('h4', { 
					text: title,
					cls: 'pttjs-page-title'
				});
			}

			// Создаем панель инструментов для редактирования таблицы
			if (this.settings.enableEditing) {
				const toolbarEl = pageContainer.createDiv({ cls: 'pttjs-toolbar' });
				
				// Кнопка добавления строки
				const addRowBtn = toolbarEl.createEl('button', { 
					text: 'Добавить строку',
					cls: 'pttjs-btn pttjs-add-row'
				});
				addRowBtn.addEventListener('click', () => {
					// Добавляем строку в конец таблицы
					const lastRowIndex = page.rows ? page.rows.length - 1 : -1;
					this.addRow(pageId, lastRowIndex);
				});
				
				// Кнопка добавления столбца
				const addColBtn = toolbarEl.createEl('button', { 
					text: 'Добавить столбец',
					cls: 'pttjs-btn pttjs-add-col'
				});
				addColBtn.addEventListener('click', () => {
					// Добавляем столбец в конец таблицы
					const lastColIndex = page.rows && page.rows.length > 0 ? page.rows[0].length - 1 : -1;
					this.addColumn(pageId, lastColIndex);
				});
			}

			// Создаем таблицу
			const table = pageContainer.createEl('table', { cls: 'pttjs-table' });
			const tbody = table.createEl('tbody');

			// Создаем строки и ячейки
			if (rows && Array.isArray(rows)) {
				// Предварительная обработка ячеек, для colspan и rowspan
				const ignoreRowCell: IgnoreRowCell = {};
				rows.forEach((oldRow, oldRowIndex) => {
					if (Array.isArray(oldRow)) {
						const newRow: CellItemWithIndex[] = [];
						oldRow.forEach((oldCell, oldCellIndex) => {
							if (!ignoreRowCell[`r${oldRowIndex}`]?.includes(oldCellIndex)) {
								const newCell: CellItemWithIndex = {
									id: oldCell.id,
									value: oldCell.value,
									scale: oldCell.scale,
									index: oldCell.index,
									isHeader: oldCell.isHeader,
									indexString: `${oldCellIndex};${oldRowIndex}`
								}
								newRow.push(newCell);
								if (Array.isArray(oldCell.scale) && oldCell.scale.length > 1) {
									if (oldCell.scale[0] > 1) {
										const ignoreCellLength = oldCell.scale[0] - 1;
										for (let ignoreIndex = 0; ignoreIndex < ignoreCellLength; ignoreIndex++) {
											addIgnoreRowCellItem(oldCellIndex+ignoreIndex+1,oldRowIndex,ignoreRowCell);
										}
									}
									if (oldCell.scale[1] > 1) {
										const ignoreRowLength = oldCell.scale[1] - 1;
										for (let ignoreIndex = 0; ignoreIndex < ignoreRowLength; ignoreIndex++) {
											addIgnoreRowCellItem(oldCellIndex,oldRowIndex+ignoreIndex+1,ignoreRowCell);
										}
									}
								}
							}
						})
						normalizedRows.push(newRow);
					}
				})

				normalizedRows.forEach((row, rowIndex) => {
					const tr = tbody.createEl('tr');
					
					// Добавляем кнопку добавления строки после этой строки
					if (this.settings.enableEditing) {
						tr.oncontextmenu = (e) => {
							e.preventDefault();
							const menu = new Menu();
							
							menu.addItem((item) => 
								item.setTitle('Добавить строку после')
									.onClick(() => this.addRow(pageId, rowIndex))
							);
							
							if (rowIndex > 0) {
								menu.addItem((item) => 
									item.setTitle('Добавить строку до')
										.onClick(() => this.addRow(pageId, rowIndex - 1))
								);
							}
							
							menu.showAtPosition({ x: e.pageX, y: e.pageY });
						};
					}

					if (Array.isArray(row)) {
						row.forEach((cell, cellIndex) => {
							// Определяем тип ячейки (th или td)
							const isHeader = cell.isHeader;
							const cellEl = tr.createEl(isHeader ? 'th' : 'td', { cls: 'pttjs-cell' });
							
							// Добавляем data-атрибут с indexString для идентификации ячейки
							cellEl.setAttribute('data-index', cell.indexString);
							
							// Если включен показ индексов
							if (this.settings.showIndices) {
								const indexEl = cellEl.createSpan({ 
									cls: 'pttjs-cell-index',
									text: cell.indexString
								});
							}

							// Устанавливаем значение ячейки
							if (cell.value !== undefined) {
								const valueEl = cellEl.createSpan({ 
									cls: 'pttjs-cell-value',
									text: cell.value
								});
							}

							// Устанавливаем атрибуты для объединенных ячеек
							if (Array.isArray(cell.scale) && cell.scale.length > 1) {
								if (cell.scale[0] > 1) {
									cellEl.setAttribute('colspan', cell.scale[0].toString());
								}
								if (cell.scale[1] > 1) {
									cellEl.setAttribute('rowspan', cell.scale[1].toString());
								}
							}
							
							// Добавляем обработчики событий для редактирования
							if (this.settings.enableEditing) {
								// Двойной клик для редактирования ячейки
								cellEl.addEventListener('dblclick', () => {
									const textarea = document.createElement('textarea');
									textarea.value = cell.value || '';
									textarea.className = 'pttjs-cell-editor';
									textarea.style.width = '100%';
									textarea.style.height = '100%';
									textarea.style.boxSizing = 'border-box';
									textarea.style.resize = 'none';
									
									// Очищаем содержимое ячейки и добавляем textarea
									cellEl.innerHTML = '';
									cellEl.appendChild(textarea);
									
									// Фокус на textarea
									textarea.focus();
									
									// Сохранение при потере фокуса
									textarea.addEventListener('blur', () => {
										this.updateCell(cell.indexString, textarea.value);
									});
									
									// Сохранение при нажатии Enter
									textarea.addEventListener('keydown', (e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											this.updateCell(cell.indexString, textarea.value);
										}
									});
								});
								
								// Контекстное меню для дополнительных операций
								cellEl.oncontextmenu = (e) => {
									e.preventDefault();
									const menu = new Menu();
									
									// Опция добавления столбца
									menu.addItem((item) => 
										item.setTitle('Добавить столбец после')
											.onClick(() => this.addColumn(pageId, cellIndex))
									);
									
									if (cellIndex > 0) {
										menu.addItem((item) => 
											item.setTitle('Добавить столбец до')
												.onClick(() => this.addColumn(pageId, cellIndex - 1))
										);
									}
									
									// Проверяем, объединена ли ячейка
									const isMerged = Array.isArray(cell.scale) && (cell.scale[0] > 1 || cell.scale[1] > 1);
									
									if (isMerged) {
										menu.addItem((item) => 
											item.setTitle('Разъединить ячейки')
												.onClick(() => this.splitCell(cell.indexString))
										);
									} else {
										menu.addItem((item) => 
											item.setTitle('Объединить с соседней ячейкой...')
												.onClick(() => {
													// Здесь можно добавить интерфейс выбора второй ячейки
													// Но для простоты можно объединять с ячейкой справа по умолчанию
													if (cellIndex < row.length - 1) {
														const nextCell = row[cellIndex + 1];
														this.mergeCells(cell.indexString, nextCell.indexString);
													}
												})
										);
									}
									
									menu.showAtPosition({ x: e.pageX, y: e.pageY });
								};
							}
						});
					}
				});
			}
		}
	}
}

// Класс для страницы настроек плагина
class PTTJSSettingTab extends PluginSettingTab {
	plugin: PTTJSPlugin;

	constructor(app: App, plugin: PTTJSPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'PTTJS Tables Settings' });

		new Setting(containerEl)
			.setName('Show Headers')
			.setDesc('Show page titles in PTTJS tables')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showHeaders)
				.onChange(async (value) => {
					this.plugin.settings.showHeaders = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show Cell Indices')
			.setDesc('Show row and column indices in each cell')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showIndices)
				.onChange(async (value) => {
					this.plugin.settings.showIndices = value;
					await this.plugin.saveSettings();
				}));
				
		new Setting(containerEl)
			.setName('Enable Editing')
			.setDesc('Enable interactive editing of PTTJS tables')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableEditing)
				.onChange(async (value) => {
					this.plugin.settings.enableEditing = value;
					await this.plugin.saveSettings();
				}));
	}
}

// Дополнение к Menu для контекстного меню
class Menu {
	element: HTMLElement;
	items: MenuItem[] = [];

	constructor() {
		this.element = document.createElement('div');
		this.element.className = 'pttjs-context-menu';
		this.element.style.position = 'fixed';
		this.element.style.backgroundColor = 'var(--background-primary)';
		this.element.style.border = '1px solid var(--background-modifier-border)';
		this.element.style.borderRadius = '4px';
		this.element.style.padding = '4px 0';
		this.element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
		this.element.style.zIndex = '1000';
		document.body.appendChild(this.element);
		
		// Закрыть меню при клике вне его
		document.addEventListener('click', () => this.close(), { once: true });
	}
	
	addItem(callback: (item: MenuItem) => void): Menu {
		const item = new MenuItem(this);
		this.items.push(item);
		this.element.appendChild(item.element);
		callback(item);
		return this;
	}
	
	showAtPosition(position: { x: number, y: number }): void {
		this.element.style.left = position.x + 'px';
		this.element.style.top = position.y + 'px';
		this.element.style.display = 'block';
	}
	
	close(): void {
		document.body.removeChild(this.element);
	}
}

class MenuItem {
	element: HTMLElement;
	menu: Menu;
	
	constructor(menu: Menu) {
		this.menu = menu;
		this.element = document.createElement('div');
		this.element.className = 'pttjs-menu-item';
		this.element.style.padding = '6px 12px';
		this.element.style.cursor = 'pointer';
		this.element.addEventListener('mouseenter', () => {
			this.element.style.backgroundColor = 'var(--background-modifier-hover)';
		});
		this.element.addEventListener('mouseleave', () => {
			this.element.style.backgroundColor = '';
		});
	}
	
	setTitle(title: string): MenuItem {
		this.element.textContent = title;
		return this;
	}
	
	onClick(callback: () => void): MenuItem {
		this.element.addEventListener('click', (e) => {
			e.stopPropagation();
			callback();
			this.menu.close();
		});
		return this;
	}
}