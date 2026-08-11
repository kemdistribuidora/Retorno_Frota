import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODIGO_PATH = path.resolve(__dirname, '../../codigo.gs');

const pad = n => String(n).padStart(2, '0');

export function criarPlanilhaFalsa({ maxRows = 1000, existente = null } = {}) {
  const grid = new Map();
  if (existente) {
    existente.forEach((linha, indice) => grid.set(indice + 1, linha.slice()));
  }

  const range = (linha, coluna, numLinhas, numColunas) => ({
    getValues() {
      const out = [];
      for (let i = 0; i < numLinhas; i++) {
        const linhaDados = grid.get(linha + i) || [];
        const out2 = [];
        for (let j = 0; j < numColunas; j++) out2.push(linhaDados[coluna - 1 + j] ?? '');
        out.push(out2);
      }
      return out;
    },
    getDisplayValues() {
      return this.getValues().map(l => l.map(v => {
        if (v instanceof Date) return 'DATA';
        if (v === '' || v === null || v === undefined) return '';
        return String(v);
      }));
    },
    setValues(valores) {
      for (let i = 0; i < valores.length; i++) {
        const linhaDados = grid.get(linha + i) || [];
        for (let j = 0; j < valores[i].length; j++) linhaDados[coluna - 1 + j] = valores[i][j];
        grid.set(linha + i, linhaDados);
      }
      return this;
    },
    setNumberFormat() { return this; },
    setFontWeight() { return this; },
    setBackground() { return this; },
    setFontColor() { return this; }
  });

  return {
    _grid: grid,
    getMaxRows: () => maxRows,
    getRange: (l, c, nl, nc) => range(l, c, nl, nc),
    setFrozenRows() {}
  };
}

// vm.createContext cria um realm novo com seu proprio Date/Array/etc, o que
// quebra `instanceof Date` para objetos criados no teste. Por isso injetamos
// os builtins do realm principal no sandbox antes de criar o contexto: assim
// o codigo.gs enxerga o MESMO Date/Array/Object/... que o arquivo de teste.
export function criarContexto({ planilha = null, abaAusente = false, fusoHorario = 'America/Sao_Paulo' } = {}) {
  const sandbox = {
    console, Date, Array, Object, JSON, Number, String, RegExp, Set, Error, Math,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: () => (abaAusente ? null : planilha),
        getSpreadsheetTimeZone: () => fusoHorario
      })
    },
    Utilities: {
      formatDate: (data, _tz, formato) => {
        if (!(data instanceof Date)) return '';
        if (formato === 'yyyy-MM-dd') return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
        if (formato === 'HH:mm') return `${pad(data.getHours())}:${pad(data.getMinutes())}`;
        if (formato === 'dd/MM/yyyy') return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()}`;
        throw new Error(`formato nao suportado no mock: ${formato}`);
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON', JAVASCRIPT: 'JAVASCRIPT' },
      createTextOutput(texto) {
        return {
          _texto: texto,
          _mime: null,
          setMimeType(mime) { this._mime = mime; return this; }
        };
      }
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutputFromFile(nome) {
        return {
          _arquivo: nome,
          _titulo: null,
          setTitle(t) { this._titulo = t; return this; },
          setXFrameOptionsMode(m) { this._xfo = m; return this; }
        };
      }
    }
  };

  vm.createContext(sandbox);
  const codigo = fs.readFileSync(CODIGO_PATH, 'utf8');
  new vm.Script(codigo, { filename: 'codigo.gs' }).runInContext(sandbox);
  return sandbox;
}
