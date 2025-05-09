import { readFileSync, writeFileSync } from "fs";

// чтение текущей версии из package.json
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const currentVersion = packageJson.version;

// чтение manifest.json и обновление версии
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = currentVersion;

// запись обновленного manifest.json
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2));

// чтение versions.json
let versions = {};
try {
    versions = JSON.parse(readFileSync("versions.json", "utf8"));
} catch (e) {
    console.log("Не удалось прочитать versions.json, создание нового файла.");
}

// обновление versions.json с минимальной версией приложения
versions[currentVersion] = manifest.minAppVersion;

// запись обновленного versions.json
writeFileSync("versions.json", JSON.stringify(versions, null, 2));

console.log(`Версия обновлена до ${currentVersion}`);