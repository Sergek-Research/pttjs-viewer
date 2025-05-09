import { Plugin, MarkdownView, Notice, PluginSettingTab, App, Setting } from 'obsidian';
import { parse, Store } from '@sergek-research/pttjs';
import { CellItem } from '@sergek-research/pttjs/dist/parser';

interface CellItemWithIndex extends CellItem {
	indexString: string;
}

// Интерфейс для настроек плагина
interface PTTJSPluginSettings {
	showHeaders: boolean;
	showIndices: boolean;
}

// Значения настроек по умолчанию
const DEFAULT_SETTINGS: PTTJSPluginSettings = {
	showHeaders: false,
	showIndices: false
}

interface IgnoreRowCell { [key:string]: number[] }

function addIgnoreRowCellItem(indexCell: number, indexRow: number, ignoreObj: IgnoreRowCell) {
	if (!Array.isArray(ignoreObj[`r${indexRow}`])) {
		ignoreObj[`r${indexRow}`] = [];
	}
	ignoreObj[`r${indexRow}`].push(indexCell);
}

export default class PTTJSPlugin extends Plugin {
	settings: PTTJSPluginSettings;

	async onload() {
		await this.loadSettings();

		// Регистрация постпроцессора для обработки блоков кода с языком pttjs
		this.registerMarkdownCodeBlockProcessor('pttjs', async (source, el, ctx) => {
			try {
				const pttjsData = await parse(source);
				this.renderPTTJSTable(pttjsData, el);
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

	// Рендеринг таблицы PTTJS
	renderPTTJSTable(pttjsData: Store, containerEl: HTMLElement) {
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

					if (Array.isArray(row)) {
						row.forEach((cell, cellIndex) => {
							// Определяем тип ячейки (th или td)
							const isHeader = cell.isHeader;
							const cellEl = tr.createEl(isHeader ? 'th' : 'td', { cls: 'pttjs-cell' });

							// Устанавливаем значение ячейки
							if (cell.value !== undefined) {
								const valueEl = cellEl.createSpan({ 
									cls: 'pttjs-cell-value',
									text: cell.value
								});
							}

							if (Array.isArray(cell.scale) && cell.scale.length > 1) {
								if (cell.scale[0] > 1) {
									cellEl.setAttribute('colspan', cell.scale[0].toString());
								}
								if (cell.scale[1] > 1) {
									cellEl.setAttribute('rowspan', cell.scale[1].toString());
								}
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
	}
}