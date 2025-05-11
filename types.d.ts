// types.d.ts
declare module '@sergek-research/pttjs' {
    /**
     * Ячейка PTTJS таблицы
     */
    export type CellItem = {
        /**
         * Является ли заголовком
         */
        isHeader: boolean | null;
        /**
         * Индекс ячейки по X
         */
        index: number;
        /**
         * Масштаб в формате [x, y]
         */
        scale: [number, number] | null;
        /**
         * Идентификатор элемента
         */
        id: string | null;
        /**
         * Содержимое
         * Объект ячейки
         */
        value: string;
    };

    /**
     * Страница (лист) PTTJS таблицы
     */
    export interface PageItem {
        /** Заголовок страницы */
        title: string;
        /** Строки таблицы */
        rows: CellItem[][];
    }

    /**
     * Выражение/скрипт в PTTJS
     */
    export interface ScriptArray extends Array<any> {}

    /**
     * Хранилище данных PTTJS
     */
    export interface Store {
        /** Данные таблиц по страницам */
        data: { [pageId: string]: PageItem };
        /** Скрипты для типизации данных */
        typings: ScriptArray[];
        /** Скрипты для вычислений */
        expressions: ScriptArray[];
        /** Скрипты для стилизации */
        styles: ScriptArray[];
    }

    /**
     * Парсит строку PTTJS и возвращает объект Store
     */
    export function parse(text: string): Promise<Store>;

    /**
     * Парсит строку PTTJS и возвращает объект Store
     */
    export function parseSync(text: string): Store;

    /**
     * Сериализует объект Store в строку PTTJS
     */
    export function serialize(
        store: Store, 
        showIndex?: boolean, 
        showPages?: boolean
    ): Promise<string>;

    /**
     * Экранирует специальные символы для PTTJS
     */
    export function escapeValue(value: string): string;

    /**
     * Раскодирует экранированные символы PTTJS
     */
    export function unescapeValue(value: string): string;
}

interface Window {
    selectedCols?: Set<Element> | null;
    isSelecting?: boolean | null;
    selectedPage?: string | null;
}