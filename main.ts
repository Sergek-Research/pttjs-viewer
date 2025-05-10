import { Plugin, MarkdownView, Notice, PluginSettingTab, App, Setting, Editor, MarkdownSectionInformation, TAbstractFile } from 'obsidian';
import { parse, parseSync } from '@sergek-research/pttjs';
import { PTTJSContext } from './pttjsContext';
import { t } from "./i18n/i18n";

interface BlockRef {
  filePath: string;
  section: MarkdownSectionInformation;
}

// Интерфейс для настроек плагина
export interface PTTJSPluginSettings {
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

export default class PTTJSPlugin extends Plugin {
  settings: PTTJSPluginSettings;
  blockIndex = new WeakMap<HTMLElement, PTTJSContext>();

  async onload() {
    await this.loadSettings();

    // Регистрация постпроцессора для обработки блоков кода с языком pttjs
    this.registerMarkdownCodeBlockProcessor('pttjs', async (source, el, ctx) => {
      try {
        const pttjsData = await parse(source);
        const info = ctx.getSectionInfo(el);
        this.blockIndex.set(el, new PTTJSContext(pttjsData, el, ctx.sourcePath, info, this));
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
    if ((window as any).selectedCols) {
      delete (window as any).selectedCols;
    }
    if ((window as any).isSelecting) {
      delete (window as any).isSelecting;
    }
    if ((window as any).selectedPage) {
      delete (window as any).selectedPage;
    }
    console.log('PTTJS plugin unloaded');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** Заменяет содержимое данного блока на новый текст */
  async replaceBlock(ref: BlockRef, newContent: string) {
    const file = this.app.vault.getAbstractFileByPath(ref.filePath);
    if (!file || !(file instanceof TAbstractFile)) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file?.path === ref.filePath) {
      const editor = view?.editor;
      if (!editor) return;

      const { left, top } = editor.getScrollInfo!();

      const from = { line: ref.section.lineStart + 1, ch: 0 };
      const to   = { line: ref.section.lineEnd - 1,   ch: 0 };
      view.editor.transaction({ 
        changes: [{text: newContent, from, to}], 
      });

      requestAnimationFrame(() => editor.scrollTo(left, top));

      new Notice(t('notices.tableUpdated'));
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

    containerEl.createEl('h2', { text: t('settings.title') });

    new Setting(containerEl)
      .setName(t('settings.showHeaders.name'))
      .setDesc(t('settings.showHeaders.desc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showHeaders)
        .onChange(async (value) => {
          this.plugin.settings.showHeaders = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.showIndices.name'))
      .setDesc(t('settings.showIndices.desc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showIndices)
        .onChange(async (value) => {
          this.plugin.settings.showIndices = value;
          await this.plugin.saveSettings();
        }));
        
    new Setting(containerEl)
      .setName(t('settings.enableEditing.name'))
      .setDesc(t('settings.enableEditing.desc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableEditing)
        .onChange(async (value) => {
          this.plugin.settings.enableEditing = value;
          await this.plugin.saveSettings();
        }));
  }
}
