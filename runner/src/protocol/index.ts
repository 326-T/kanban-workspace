// runner と backend / frontend の言語間契約。
// backend（Kotlin）はイベントを「type と数フィールド以外は不透明な JSON」として扱い、
// frontend は描画のためにこの型を直接参照する（tsconfig の paths 経由、型のみ）。
export * from "./events";
