import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.resolve(__dirname, '../index.html');
const HTML = fs.readFileSync(INDEX_PATH, 'utf8');

function montarPagina() {
  const dom = new JSDOM(HTML, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    resources: undefined,
    pretendToBeVisual: true
  });
  return dom;
}

// Faz o fetch JSONP (buscarLancamentosPorData) responder de forma sincrona
// e controlada em vez de tentar carregar um <script src> externo de verdade.
function interceptarJsonp(dom, resposta) {
  const { document, window } = dom.window;
  const appendOriginal = document.head.appendChild.bind(document.head);
  document.head.appendChild = node => {
    const resultado = appendOriginal(node);
    if (node.tagName === 'SCRIPT' && node.src && node.src.includes('acao=listarRecebimentos')) {
      const url = new URL(node.src);
      const nomeCallback = url.searchParams.get('callback');
      if (typeof window[nomeCallback] === 'function') window[nomeCallback](resposta);
    }
    return resultado;
  };
}

test('pagina gera 50 linhas iniciais no grid', () => {
  const dom = montarPagina();
  const linhas = dom.window.document.querySelectorAll('#linhas tr');
  assert.equal(linhas.length, 50);
});

test('mascara de hora formata digitos com dois pontos', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  const inputHora = document.querySelector('#linhas tr:first-child .hora');
  inputHora.value = '0830';
  inputHora.dispatchEvent(new window.Event('input'));
  assert.equal(inputHora.value, '08:30');
});

test('mascara de hora limpa valor invalido no blur', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  const inputHora = document.querySelector('#linhas tr:first-child .hora');
  inputHora.value = '25:99';
  inputHora.dispatchEvent(new window.Event('blur'));
  assert.equal(inputHora.value, '');
});

test('mascara de hora aceita hora valida e normaliza com zero a esquerda', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  const inputHora = document.querySelector('#linhas tr:first-child .hora');
  inputHora.value = '0830';
  inputHora.dispatchEvent(new window.Event('input'));
  inputHora.dispatchEvent(new window.Event('blur'));
  assert.equal(inputHora.value, '08:30');
});

test('obterDadosDaLinha le todas as celulas da linha', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  const linha = document.querySelector('#linhas tr:first-child');
  const celulas = linha.querySelectorAll('input, select');
  celulas[1].value = 'Frota-9';
  celulas[4].value = 'Produto Teste';
  const dados = window.obterDadosDaLinha(linha);
  assert.equal(dados.frota, 'Frota-9');
  assert.equal(dados.produto, 'Produto Teste');
});

test('obterLancamentos ignora linhas totalmente vazias', () => {
  const dom = montarPagina();
  const { window } = dom.window;
  const lancamentos = window.obterLancamentos();
  assert.equal(lancamentos.length, 0);
});

test('obterLancamentos retorna apenas linhas com conteudo alterado', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  const linha = document.querySelector('#linhas tr:first-child');
  linha.querySelectorAll('input, select')[1].value = 'F1';

  const lancamentos = window.obterLancamentos();
  assert.equal(lancamentos.length, 1);
  assert.equal(lancamentos[0].frota, 'F1');
});

test('marcarLancamentosComoSalvos impede reenvio do mesmo lancamento', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  const linha = document.querySelector('#linhas tr:first-child');
  linha.querySelectorAll('input, select')[1].value = 'F1';

  window.marcarLancamentosComoSalvos();
  const lancamentos = window.obterLancamentos();
  assert.equal(lancamentos.length, 0);
});

test('marcarLancamentosComoSalvos nao impede envio apos nova alteracao', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  const linha = document.querySelector('#linhas tr:first-child');
  const campos = linha.querySelectorAll('input, select');
  campos[1].value = 'F1';

  window.marcarLancamentosComoSalvos();
  campos[1].value = 'F1-editado';
  const lancamentos = window.obterLancamentos();
  assert.equal(lancamentos.length, 1);
  assert.equal(lancamentos[0].frota, 'F1-editado');
});

test('preencherLancamentos preenche grid e guarda linhaPlanilha', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  window.preencherLancamentos([
    { linhaPlanilha: 5, hora: '08:00', frota: 'F5', nfe: '1', quantidade: '1', produto: 'P', motorista: 'M', caixas: '1', conferente: 'Alzoni', paletes: '1' }
  ]);
  const linha = document.querySelector('#linhas tr:first-child');
  assert.equal(linha.dataset.linhaPlanilha, '5');
  assert.equal(linha.querySelectorAll('input, select')[1].value, 'F5');
});

test('preencherLancamentos limpa linhas anteriores antes de repreencher', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  window.preencherLancamentos([{ frota: 'F1', linhaPlanilha: 2 }]);
  window.preencherLancamentos([]);
  const linha = document.querySelector('#linhas tr:first-child');
  assert.equal(linha.querySelectorAll('input, select')[1].value, '');
  assert.equal(linha.dataset.linhaPlanilha, undefined);
});

test('preencherLancamentos cria linhas extras quando a lista e maior que o grid atual', () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  const muitos = Array.from({ length: 60 }, (_, i) => ({ frota: `F${i}`, linhaPlanilha: i + 2 }));
  window.preencherLancamentos(muitos);
  const linhas = document.querySelectorAll('#linhas tr');
  assert.equal(linhas.length, 60);
});

test('botao salvar sem data pede para informar a data e nao chama fetch', async () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  document.getElementById('dataLancamento').value = '';
  let chamouFetch = false;
  window.fetch = async () => { chamouFetch = true; };

  document.getElementById('salvar').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 0));

  assert.equal(chamouFetch, false);
  assert.match(document.getElementById('status').textContent, /Informe a data/);
});

test('botao salvar sem alteracoes mostra "nenhuma alteracao" e nao chama fetch', async () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  let chamouFetch = false;
  window.fetch = async () => { chamouFetch = true; };

  document.getElementById('salvar').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 0));

  assert.equal(chamouFetch, false);
  assert.match(document.getElementById('status').textContent, /Nenhuma alteração/);
});

test('botao salvar com lancamento novo envia payload correto via fetch e marca como salvo', async () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  interceptarJsonp(dom, { sucesso: true, lancamentos: [] });

  document.querySelector('#linhas tr:first-child').querySelectorAll('input, select')[1].value = 'F1';

  let corpoEnviado = null;
  window.fetch = async (url, opts) => {
    corpoEnviado = opts.body;
    return { ok: true };
  };

  document.getElementById('salvar').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 10));

  assert.ok(corpoEnviado, 'fetch deveria ter sido chamado');
  const parametros = new URLSearchParams(corpoEnviado.toString());
  const payload = JSON.parse(parametros.get('payload'));
  assert.equal(payload.setor, 'RetornoFrota');
  assert.equal(payload.lancamentos.length, 1);
  assert.equal(payload.lancamentos[0].frota, 'F1');

  // apos salvar, o app recarrega a lista da data (buscarLancamentosPorData),
  // que sobrescreve a mensagem de "enviado" pelo resultado dessa nova busca.
  assert.match(document.getElementById('status').textContent, /Nenhum lançamento encontrado/);

  const lancamentosAposSalvar = window.obterLancamentos();
  assert.equal(lancamentosAposSalvar.length, 0, 'linha deveria estar marcada como salva');
});

test('botao salvar mostra erro quando fetch falha', async () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  document.querySelector('#linhas tr:first-child').querySelectorAll('input, select')[1].value = 'F1';

  window.fetch = async () => { throw new Error('rede indisponivel'); };

  document.getElementById('salvar').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 10));

  assert.match(document.getElementById('status').textContent, /Falha ao enviar/);
  assert.equal(document.getElementById('salvar').disabled, false);
});

test('botao atualizar sem data pede para informar a data', async () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  document.getElementById('dataLancamento').value = '';

  await window.buscarLancamentosPorData();

  assert.match(document.getElementById('status').textContent, /Informe a data/);
});

test('botao atualizar preenche grid com lancamentos retornados', async () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  document.getElementById('dataLancamento').value = '2026-08-11';
  interceptarJsonp(dom, {
    sucesso: true,
    lancamentos: [{ linhaPlanilha: 2, hora: '08:00', frota: 'F1', nfe: '1', quantidade: '1', produto: 'P', motorista: 'M', caixas: '1', conferente: 'Alzoni', paletes: '1' }]
  });

  await window.buscarLancamentosPorData();

  const linha = document.querySelector('#linhas tr:first-child');
  assert.equal(linha.querySelectorAll('input, select')[1].value, 'F1');
  assert.match(document.getElementById('status').textContent, /1 lançamento/);
});

test('botao atualizar mostra mensagem quando planilha nao retorna nada', async () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  document.getElementById('dataLancamento').value = '2026-08-11';
  interceptarJsonp(dom, { sucesso: true, lancamentos: [] });

  await window.buscarLancamentosPorData();

  assert.match(document.getElementById('status').textContent, /Nenhum lançamento encontrado/);
});

test('botao atualizar mostra erro quando o backend responde sucesso:false', async () => {
  const dom = montarPagina();
  const { document, window } = dom.window;
  document.getElementById('dataLancamento').value = '2026-08-11';
  interceptarJsonp(dom, { sucesso: false, mensagem: 'A data informada é inválida.' });

  await window.buscarLancamentosPorData();

  assert.match(document.getElementById('status').textContent, /inválida/);
});

test('assinaturaDoLancamento gera mesma assinatura para os mesmos dados', () => {
  const dom = montarPagina();
  const { window } = dom.window;
  const a = window.assinaturaDoLancamento({ data: '2026-08-11', hora: '08:00', frota: 'F1', nfe: '', quantidade: '', produto: '', motorista: '', caixas: '', conferente: '', paletes: '' });
  const b = window.assinaturaDoLancamento({ data: '2026-08-11', hora: '08:00', frota: 'F1', nfe: '', quantidade: '', produto: '', motorista: '', caixas: '', conferente: '', paletes: '' });
  assert.equal(a, b);
});
