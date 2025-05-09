import { Plugin, MarkdownView, Notice, PluginSettingTab, App, Setting } from 'obsidian';
import { parse, Store } from '@sergek-research/pttjs';

// Интерфейс для настроек плагина
interface PTTJSPluginSettings {
	showHeaders: boolean;
	showIndices: boolean;
}

// Значения настроек по умолчанию
const DEFAULT_SETTINGS: PTTJSPluginSettings = {
	showHeaders: true,
	showIndices: false
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

		// Для каждой страницы (листа) в данных PTTJS
		for (const pageId in pttjsData.data) {
			const page = pttjsData.data[pageId];
			const { title, rows } = page;

			// Создаем контейнер для отдельного листа
			const pageContainer = pttjsContainer.createDiv({ cls: 'pttjs-page' });
			
			// Добавляем заголовок листа, если он есть
			if (title && this.settings.showHeaders) {
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
				rows.forEach((row, rowIndex) => {
					const tr = tbody.createEl('tr');

					if (Array.isArray(row)) {
						row.forEach((cell, cellIndex) => {
							// Определяем тип ячейки (th или td)
							const isHeader = cell.isHeader;
							const cellEl = tr.createEl(isHeader ? 'th' : 'td', { cls: 'pttjs-cell' });

							// Отображаем индексы ячеек, если включено в настройках
							if (this.settings.showIndices) {
								const indexSpan = cellEl.createSpan({ 
									cls: 'pttjs-cell-index',
									text: `[${rowIndex}|${cellIndex}]`
								});
							}

							// Устанавливаем значение ячейки
							if (cell.value !== undefined) {
								const valueEl = cellEl.createSpan({ 
									cls: 'pttjs-cell-value',
									text: cell.value
								});
							}

							// Устанавливаем атрибуты colspan и rowspan, если они есть
							if (cell.colspan && cell.colspan > 1) {
								cellEl.setAttribute('colspan', cell.colspan.toString());
							}
							if (cell.rowspan && cell.rowspan > 1) {
								cellEl.setAttribute('rowspan', cell.rowspan.toString());
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