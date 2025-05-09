# PTTJS Usage Examples in Obsidian

Below are sample PTTJS tables that will render correctly in Obsidian once the plugin is installed.

## Simple table

```pttjs
|PTTJS 1.0|encoding=UTF-8|
|H>Name|H>Age|H>Profession<|
|>Ivan|>30|>Programmer<|
|>Maria|>28|>Designer<|
|>Alexey|>35|>Manager<|
```

## Table with merged cells

```pttjs
|PTTJS 1.0|encoding=UTF‑8|
|H(1|2)>Plate No.|H(2|1)>Vehicle Info|H><|
|H>|H>Year|H>Make & Model<|
|>080XXX02|>2007|>LEXUS RX 350<|
|>787XXX16|>2015|>GEELY GC7<|
|>871XXX05|>1997|>TOYOTA IPSUM<|
|>A602XXX|>1996|>MITSUBISHI PAJERO<|
|>890XXX02|>1997|>TOYOTA LAND CRUISER PRADO<|
|>216XXX13|>2007|>DAEWOO NEXIA<|
```

## Multi‑page table

```pttjs
|PTTJS 1.0|encoding=UTF-8|
|(@page1|Employees){
|H>ID|H>Name|H>Department<|
|>1|>Ivan|>IT<|
|>2|>Maria|>Marketing<|
}|
|(@page2|Departments){
|H>ID|H>Department|H>Head<|
|>1|>IT|>Alexey<|
|>2|>Marketing|>Elena<|
}|
```

## Styled table

Scheduled for support in future plugin versions:

```pttjs
|PTTJS 1.0|encoding=UTF-8|
|H>Metric|H>Value|H>Status<|
|>Sales|>1250|>Good<|
|>Expenses|>980|>Normal<|
|>Profit|>270|>Low<|
>>>SCRIPT
(0|2)<=BACKGROUND(#e6ffe6)
(1|2)<=BACKGROUND(#ffffcc)
(2|2)<=BACKGROUND(#ffcccc)
<<<SCRIPT
```

## How it works

1. The plugin automatically detects code blocks with the `pttjs` language tag.
2. It parses the content and renders the table using the PTTJS library.
3. In preview mode, the rendered table replaces the original block.

## Useful links

- [PTTJS Format Specification](https://github.com/Sergek-Research/PTTJS/blob/main/docs/PTTJS_FORMAT_SPECIFICATION.md)
- [PTTJS library on npm](https://www.npmjs.com/package/@sergek-research/pttjs)
- [PTTJS GitHub repository](https://github.com/Sergek-Research/PTTJS)
