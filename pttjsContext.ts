import { Store, serialize, CellItem } from '@sergek-research/pttjs';
import { Menu } from 'contextMenu';
import PTTJSPlugin from 'main';
import { MarkdownSectionInformation, Notice } from 'obsidian';

interface CellItemWithIndex extends CellItem {
  indexString: string;
}

interface IgnoreRowCell { [key: string]: number[] }

function addIgnoreRowCellItem(indexCell: number, indexRow: number, ignoreObj: IgnoreRowCell) {
  if (!Array.isArray(ignoreObj[`r${indexRow}`])) {
    ignoreObj[`r${indexRow}`] = [];
  }
  ignoreObj[`r${indexRow}`].push(indexCell);
}

export class PTTJSContext {
  constructor (
    private currentPTTJSData: Store, 
    private currentTableContainer: HTMLElement, 
    private filePath: string,
    private markdownInfo: MarkdownSectionInformation,
    private plugin: PTTJSPlugin, 
  ) {
    this.renderPTTJSTable(currentPTTJSData, currentTableContainer);
  }
  private currentCell: HTMLTableCellElement | null = null;
  private currentCellValue: string | null = null;

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
      await this.plugin.replaceBlock({ filePath: this.filePath, section: this.markdownInfo }, newSource);
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
      await this.plugin.replaceBlock({ filePath: this.filePath, section: this.markdownInfo }, newSource);
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
      await this.plugin.replaceBlock({ filePath: this.filePath, section: this.markdownInfo }, newSource);
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
      await this.plugin.replaceBlock({ filePath: this.filePath, section: this.markdownInfo }, newSource);
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
      await this.plugin.replaceBlock({ filePath: this.filePath, section: this.markdownInfo }, newSource);
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
      await this.plugin.replaceBlock({ filePath: this.filePath, section: this.markdownInfo }, newSource);
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
            await this.plugin.replaceBlock({ filePath: this.filePath, section: this.markdownInfo }, newSource);
          } catch (error) {
            console.error('Error serializing PTTJS data:', error);
            new Notice('Ошибка добавления столбца');
          }
        }
      }
    }
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
      if (title && (this.plugin.settings.showHeaders || pagesCount > 1)) {
        pageContainer.createEl('h4', { 
          text: title,
          cls: 'pttjs-page-title'
        });
      }

      // Создаем таблицу
      const table = pageContainer.createEl('table', { cls: ['pttjs-table',pageId] });
      const tbody = table.createEl('tbody');

      this.plugin.registerDomEvent(table, 'mousedown', (e: MouseEvent) => {
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

      this.plugin.registerDomEvent(table, 'mousemove', (e: MouseEvent) => {
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

      this.plugin.registerDomEvent(table, 'mouseup', () => {
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
              if (this.plugin.settings.showIndices) {
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
              if (this.plugin.settings.enableEditing) {
                // Двойной клик для редактирования ячейки
                this.plugin.registerDomEvent(cellEl, 'dblclick', () => {
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
                  this.plugin.registerDomEvent(textarea, 'keydown', (e) => {
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
                this.plugin.registerDomEvent(cellEl, 'contextmenu', (e) => {
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
                });
              }
            });
          }
        });
      }
    }
  }
}