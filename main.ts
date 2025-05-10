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
  // Сохраняем ссылку на контейнер текущей таблицы
  currentTableContainer: HTMLElement | null = null;
  // Флаг для предотвращения множественных обновлений
  isUpdating: boolean = false;
  currentCell: HTMLTableCellElement | null = null;
  currentCellValue: string | null = null;

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
        
        // Сохраняем ссылку на контейнер
        this.currentTableContainer = el;
        
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
  async updateSourceText(newSource: string) {
    if (this.currentEditor && this.currentSourcePosition && !this.isUpdating) {
      // Устанавливаем флаг обновления
      this.isUpdating = true;
      
      try {
        // Сохраняем текущую позицию прокрутки
        const scrollElement = document.querySelector('.view-content > .markdown-source-view.mod-cm6 > .cm-editor > .cm-scroller');
        const scrollInfo = {
          top: scrollElement?.scrollTop || 0,
          left: scrollElement?.scrollLeft || 0
        };

        const { start, end } = this.currentSourcePosition;
        const currentText = this.currentEditor.getValue();
        const newText = currentText.substring(0, start) 
          + "```pttjs\n" + newSource + "\n```" 
          + currentText.substring(end);
        
        // Установка значения с сохранением истории редактирования
        this.currentEditor.setValue(newText);
        
        // Обновляем текущие позиции кода
        this.currentSourcePosition = {
          start,
          end: start + "```pttjs\n".length + newSource.length + "\n```".length
        };
        
        // Восстанавливаем позицию прокрутки с задержкой
        setTimeout(() => {
          scrollElement?.scrollTo({
            top: scrollInfo.top,
            left: scrollInfo.left,
            behavior: 'auto' // Используем 'auto' вместо 'smooth'
          });
          
          // Уведомление пользователя
          new Notice('PTTJS таблица обновлена');
          
          // Снимаем флаг обновления
          this.isUpdating = false;
        }, 10);
      } catch (error) {
        console.error('Error updating PTTJS text:', error);
        this.isUpdating = false;
      }
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
          cell: page.rows[rowIndex][cellIndex] as CellItem,
          rowIndex,
          cellIndex
        };
      }
    }
    
    return null;
  }

  // Обновление ячейки в Store
  async updateCell(indexString: string, newValue: string) {
    const cellInfo = this.getCellByIndexString(indexString);
    if (!cellInfo || !this.currentPTTJSData) return;

    const { pageId, rowIndex, cellIndex } = cellInfo;
    
    // Обновляем значение ячейки
    this.currentPTTJSData.data[pageId].rows[rowIndex][cellIndex].value = newValue;
    
    // Сериализуем обновленную Store обратно в текст
    try {
      const newSource = await serialize(this.currentPTTJSData);
      await this.updateSourceText(newSource);
    } catch (error) {
      console.error('Error serializing PTTJS data:', error);
      new Notice('Ошибка обновления PTTJS таблицы');
    }
  }

  // Добавление новой строки в таблицу
  async addRow(pageId: string, afterRowIndex: number) {
    if (!this.currentPTTJSData) return;
    
    const page = this.currentPTTJSData.data[pageId];
    if (!page.rows) return;
    
    // Определяем количество ячеек в новой строке
    const cellsCount = page.rows.length > 0 ? page.rows[0].length : 1;
    
    // Создаем новую строку с пустыми ячейками
    const newRow: CellItem[] = Array(cellsCount).fill(null).map((_, i) => ({
      id: null,
      value: '',
      scale: null,
      index: i,
      isHeader: null
    } as unknown as CellItem));
    
    // Вставляем новую строку после указанной
    page.rows.splice(afterRowIndex + 1, 0, newRow);
    
    // Сериализуем обновленную Store обратно в текст
    try {
      const newSource = await serialize(this.currentPTTJSData);
      await this.updateSourceText(newSource);
    } catch (error) {
      console.error('Error serializing PTTJS data:', error);
      new Notice('Ошибка добавления строки');
    }
  }

  // Удаление строки таблицы
  async removeRow(pageId: string, rowIndex: number) {
    if (!this.currentPTTJSData) return;
    
    const page = this.currentPTTJSData.data[pageId];
    if (!page.rows) return;
    
    // Удаляем строку
    page.rows.splice(rowIndex, 1);
    
    // Сериализуем обновленную Store обратно в текст
    try {
      const newSource = await serialize(this.currentPTTJSData);
      await this.updateSourceText(newSource);
    } catch (error) {
      console.error('Error serializing PTTJS data:', error);
      new Notice('Ошибка добавления строки');
    }
  }

  // Добавление нового столбца в таблицу
  async addColumn(pageId: string, afterColumnIndex: number) {
    if (!this.currentPTTJSData) return;
    
    const page = this.currentPTTJSData.data[pageId];
    if (!page.rows) return;
    
    // Добавляем новую ячейку в каждую строку после указанного индекса
    page.rows.forEach((row, rowIndex) => {
      const newCell: CellItem = {
        id: null,
        value: '',
        scale: null,
        index: afterColumnIndex + 1,
        isHeader: row[0]?.isHeader
      } as unknown as CellItem;
      if (row.length < afterColumnIndex + 1) {
        for (let newIndex = row.length; newIndex < afterColumnIndex + 1; newIndex++) { 
          row.push({
            id: null,
            value: '',
            scale: null,
            index: newIndex,
            isHeader: row[0]?.isHeader
          } as unknown as CellItem);
        }
      }
      row.splice(afterColumnIndex + 1, 0, newCell);
    });
    
    // Сериализуем обновленную Store обратно в текст
    try {
      const newSource = await serialize(this.currentPTTJSData);
      await this.updateSourceText(newSource);
    } catch (error) {
      console.error('Error serializing PTTJS data:', error);
      new Notice('Ошибка добавления столбца');
    }
  }

  // Удаление строки таблицы
  async removeColumn(pageId: string, cellIndex: number) {
    if (!this.currentPTTJSData) return;
    
    const page = this.currentPTTJSData.data[pageId];
    if (!page.rows) return;
    
    // Удаляем столбец
    page.rows.forEach((row, rowIndex) => {
      if (row.length < cellIndex + 1) {
        for (let newIndex = row.length; newIndex < cellIndex + 1; newIndex++) { 
          row.push({
            id: null,
            value: '',
            scale: null,
            index: newIndex,
            isHeader: row[0]?.isHeader
          } as unknown as CellItem);
        }
      }
      row.splice(cellIndex, 1);
    });
    
    // Сериализуем обновленную Store обратно в текст
    try {
      const newSource = await serialize(this.currentPTTJSData);
      await this.updateSourceText(newSource);
    } catch (error) {
      console.error('Error serializing PTTJS data:', error);
      new Notice('Ошибка добавления столбца');
    }
  }

  // Добавление нового столбца в таблицу
  async unmergeCell(pageId: string, cellIndex: number, rowIndex: number) {
    if (!this.currentPTTJSData) return;
    
    const page = this.currentPTTJSData.data[pageId];
    if (!page.rows) return;

    const changeCell = page.rows?.[rowIndex]?.[cellIndex];
    if (!changeCell) return;
    changeCell.scale = null;
    
    // Сериализуем обновленную Store обратно в текст
    try {
      const newSource = await serialize(this.currentPTTJSData);
      await this.updateSourceText(newSource);
    } catch (error) {
      console.error('Error serializing PTTJS data:', error);
      new Notice('Ошибка добавления столбца');
    }
  }

  // Объединение ячеек
  async mergeCells() {
    if (((window as any).selectedCols as Set<Element>)?.size && ((window as any).selectedCols as Set<Element>).size > 1) {
      const pageId = (window as any).selectedPage || '';
      if (!this.currentPTTJSData) return;
      const page = this.currentPTTJSData.data[pageId];
      if (!page.rows) return;

      const colls = (window as any).selectedCols as Set<Element>;
      let minCell: number | null = null;
      let minRow: number | null = null;
      let maxCell: number | null = null;
      let maxRow: number | null = null;
      colls.forEach((el) => {
        if (el.hasAttribute('data-index')) {
          const indexString = el.getAttribute('data-index');
          if (!indexString) return;
          const cellInfo = this.getCellByIndexString(indexString);
          if (!cellInfo || !this.currentPTTJSData) return;
          if (minCell === null || minCell > cellInfo.cellIndex) {
            minCell = cellInfo.cellIndex;
          } 
          if (minRow === null || minRow > cellInfo.rowIndex) {
            minRow = cellInfo.rowIndex;
          }
          if (maxCell === null || maxCell < cellInfo.cellIndex) {
            maxCell = cellInfo.cellIndex;
          } 
          if (maxRow === null || maxRow < cellInfo.rowIndex) {
            maxRow = cellInfo.rowIndex;
          } 
        }
      })
      if (typeof minCell === 'number' && typeof minRow === 'number' && typeof maxCell === 'number' && typeof maxRow === 'number') {
        let scaleX = maxCell - minCell + 1;
        let scaleY = maxRow - minRow + 1;
        const changeCell = page.rows?.[minRow]?.[minCell];
        if (changeCell) {
          changeCell.scale = [scaleX, scaleY];

          // Сериализуем обновленную Store обратно в текст
          try {
            const newSource = await serialize(this.currentPTTJSData);
            await this.updateSourceText(newSource);
          } catch (error) {
            console.error('Error serializing PTTJS data:', error);
            new Notice('Ошибка добавления столбца');
          }
        }
      }
    }
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

      // Создаем таблицу
      const table = pageContainer.createEl('table', { cls: ['pttjs-table',pageId] });
      const tbody = table.createEl('tbody');

      table.addEventListener("mousedown", (e: MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();

        const cell = (e.target as HTMLElement)?.closest("td, th");
        if (!cell) return;

        const currentTable = (e.target as HTMLElement)?.closest("table");
        let currentPageId = '';
        if (currentTable?.classList.contains('pttjs-table')) {
          currentTable?.classList.forEach((el) => {
            if (el.startsWith('@')) {
              currentPageId = el;
            }
          });
        }
        if (currentPageId) {
          if ((window as any).selectedCols) {
            ((window as any).selectedCols as Set<Element>).forEach((element) => {
              if (element.classList.contains('selected')) {
                element.classList.remove('selected');
              }
            });
            (window as any).selectedCols = null;
            (window as any).selectedPage = null;
          }
          (window as any).isSelecting = true;
          (window as any).selectedPage = currentPageId;
          (window as any).selectedCols = new Set();
          ((window as any).selectedCols as Set<Element>).add(cell);
        }
      });

      table.addEventListener("mousemove", (e: MouseEvent) => {
        if (!(window as any).isSelecting) return;

        const cell = (e.target as HTMLElement)?.closest("td, th");
        if (!cell) return;

        ((window as any).selectedCols as Set<Element>).add(cell);
        if (((window as any).selectedCols as Set<Element>).size > 1) {
          ((window as any).selectedCols as Set<Element>).forEach((element) => {
            if (!element.classList.contains('selected')) {
              element.classList.add('selected');
            }
          });
        }
      });

      document.addEventListener("mouseup", () => {
        (window as any).isSelecting = false;
        if (!((window as any).selectedCols as Set<Element>)?.size || ((window as any).selectedCols as Set<Element>).size < 2) {
          (window as any).selectedPage = null;
          (window as any).selectedCols = null;
        }
      });

      // Создаем строки и ячейки
      if (rows && Array.isArray(rows)) {
        // Предварительная обработка ячеек, для colspan и rowspan
        const ignoreRowCell: IgnoreRowCell = {};
        let maxCellIndex = 0;
        rows.forEach((oldRow, oldRowIndex) => {
          if (Array.isArray(oldRow)) {
            const newRow: CellItemWithIndex[] = [];
            oldRow.forEach((oldCell, oldCellIndex) => {
              if (oldCellIndex > maxCellIndex) {
                maxCellIndex = oldCellIndex;
              }
              if (!ignoreRowCell[`r${oldRowIndex}`]?.includes(oldCellIndex)) {
                const newCell: CellItemWithIndex = {
                  id: oldCell.id,
                  value: oldCell.value,
                  scale: oldCell.scale,
                  index: oldCell.index,
                  isHeader: oldCell.isHeader,
                  indexString: `${oldCellIndex};${oldRowIndex}`
                } as unknown as CellItemWithIndex;
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
                  if (this.isUpdating) return; // Предотвращаем редактирование во время обновления
                  this.currentCell = cellEl;
                  this.currentCellValue = cellEl.innerHTML;
                  
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
                  
                  // Сохранение при нажатии Enter
                  textarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (textarea.value !== cell.value) {
                        this.currentCell = null;
                        this.currentCellValue = null;
                        this.updateCell(cell.indexString, textarea.value);
                      } else {
                        if (this.currentCell) {
                          this.currentCell.innerHTML = this.currentCellValue || '';
                          this.currentCell = null;
                          this.currentCellValue = null;
                        }
                      }
                    }
                    if (e.key === 'Escape' && !e.shiftKey) {
                      e.preventDefault();
                      if (this.currentCell) {
                          this.currentCell.innerHTML = this.currentCellValue || '';
                          this.currentCell = null;
                          this.currentCellValue = null;
                        }
                    }
                  });
                });
                
                // Контекстное меню для дополнительных операций
                cellEl.oncontextmenu = (e) => {
                  e.preventDefault();
                  const menu = new Menu();

                  if (cellEl.classList.contains('selected')) {
                    menu.addItem((item) => 
                      item.setTitle('Объединить ячейки')
                        .onClick(() => this.mergeCells())
                    );
                  }

                  if (cell.scale?.length === 2) {
                    if (cell.scale[0] > 1 || cell.scale[1] > 1) {
                      menu.addItem((item) => 
                        item.setTitle('Разъединить ячейки')
                          .onClick(() => this.unmergeCell(pageId, cellIndex, rowIndex))
                      );
                    }
                  }

                  // Добавляем кнопку добавления строки после этой строки
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

                  menu.addItem((item) => 
                    item.setTitle('Удалить строку')
                      .onClick(() => this.removeRow(pageId, rowIndex))
                  );
                  
                  menu.addItem((item) => 
                    item.setTitle('Удалить столбец')
                      .onClick(() => this.removeColumn(pageId, cellIndex))
                  );
                  
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

    const events = ['click', 'dblclick'];

    events.forEach(event => {
        document.addEventListener(event, () => this.close(), { once: true });
    });
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