import test from 'node:test';
import assert from 'node:assert/strict';
import { criarContexto, criarPlanilhaFalsa } from './helpers/mockGas.mjs';

// ---------- converterData_ ----------
test('converterData_ aceita dd/mm/aaaa', () => {
  const ctx = criarContexto();
  const d = ctx.converterData_('25/12/2026', 'data');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 11);
  assert.equal(d.getDate(), 25);
});

test('converterData_ aceita yyyy-mm-dd', () => {
  const ctx = criarContexto();
  const d = ctx.converterData_('2026-08-11', 'data');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 11);
});

test('converterData_ rejeita data invalida (31/02)', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.converterData_('31/02/2026', 'data'), /inválida/);
});

test('converterData_ rejeita lixo', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.converterData_('abacate', 'data'), /inválida/);
});

test('converterData_ vazio sem permiteVazio lanca erro', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.converterData_('', 'data do cabecalho'), /Informe/);
});

test('converterData_ vazio com permiteVazio retorna string vazia', () => {
  const ctx = criarContexto();
  assert.equal(ctx.converterData_('', 'data', true), '');
});

// ---------- converterQuantidade_ ----------
test('converterQuantidade_ vazio/null/undefined vira string vazia', () => {
  const ctx = criarContexto();
  assert.equal(ctx.converterQuantidade_('', 1), '');
  assert.equal(ctx.converterQuantidade_(null, 1), '');
  assert.equal(ctx.converterQuantidade_(undefined, 1), '');
});

test('converterQuantidade_ numero simples', () => {
  const ctx = criarContexto();
  assert.equal(ctx.converterQuantidade_('10', 1), 10);
});

test('converterQuantidade_ decimal brasileiro (virgula)', () => {
  const ctx = criarContexto();
  assert.equal(ctx.converterQuantidade_('10,5', 1), 10.5);
});

test('converterQuantidade_ milhar com ponto e decimal com virgula', () => {
  const ctx = criarContexto();
  assert.equal(ctx.converterQuantidade_('1.234,56', 1), 1234.56);
});

test('converterQuantidade_ rejeita negativo', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.converterQuantidade_('-5', 3), /inválido/);
});

test('converterQuantidade_ rejeita texto nao numerico', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.converterQuantidade_('abc', 7), /lançamento 7/);
});

// ---------- converterHora_ ----------
test('converterHora_ vazio retorna vazio', () => {
  const ctx = criarContexto();
  assert.equal(ctx.converterHora_('', 'hora'), '');
});

test('converterHora_ aceita 23:59', () => {
  const ctx = criarContexto();
  const d = ctx.converterHora_('23:59', 'hora');
  assert.equal(d.getHours(), 23);
  assert.equal(d.getMinutes(), 59);
});

test('converterHora_ rejeita hora > 23', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.converterHora_('24:00', 'hora'), /inválida/);
});

test('converterHora_ rejeita minuto > 59', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.converterHora_('10:60', 'hora'), /inválida/);
});

test('converterHora_ rejeita formato sem zero a esquerda', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.converterHora_('9:5', 'hora'), /inválida/);
});

// ---------- textoSeguro_ (protecao contra injecao de formula) ----------
test('textoSeguro_ mantem texto normal', () => {
  const ctx = criarContexto();
  assert.equal(ctx.textoSeguro_('Frota 12'), 'Frota 12');
});

test('textoSeguro_ escapa formula iniciando com =', () => {
  const ctx = criarContexto();
  assert.equal(ctx.textoSeguro_('=HYPERLINK("x")'), "'=HYPERLINK(\"x\")");
});

test('textoSeguro_ escapa formula iniciando com +, - e @', () => {
  const ctx = criarContexto();
  assert.equal(ctx.textoSeguro_('+1234').startsWith("'"), true);
  assert.equal(ctx.textoSeguro_('-1234').startsWith("'"), true);
  assert.equal(ctx.textoSeguro_('@cmd').startsWith("'"), true);
});

test('textoSeguro_ trata null/undefined como vazio', () => {
  const ctx = criarContexto();
  assert.equal(ctx.textoSeguro_(null), '');
  assert.equal(ctx.textoSeguro_(undefined), '');
});

// ---------- respostaJsonp_ (validacao de callback contra injecao) ----------
test('respostaJsonp_ aceita callback valido', () => {
  const ctx = criarContexto();
  const saida = ctx.respostaJsonp_('retornoFrotas123', { ok: true });
  assert.equal(saida._texto, 'retornoFrotas123({"ok":true});');
  assert.equal(saida._mime, 'JAVASCRIPT');
});

test('respostaJsonp_ rejeita callback com caracteres perigosos', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.respostaJsonp_('alert(1)//', {}), /inválido/);
  assert.throws(() => ctx.respostaJsonp_('a; fetch(1)', {}), /inválido/);
});

// ---------- converterLancamento_ ----------
test('converterLancamento_ exige frota', () => {
  const ctx = criarContexto();
  assert.throws(() => ctx.converterLancamento_({ data: '2026-08-11' }, 1), /frota/);
});

test('converterLancamento_ monta array na ordem dos cabecalhos', () => {
  const ctx = criarContexto();
  const linha = ctx.converterLancamento_({
    data: '2026-08-11', hora: '08:30', frota: 'F1', nfe: '999',
    quantidade: '10', produto: 'Produto X', motorista: 'Fulano',
    caixas: '5', conferente: 'Alzoni', paletes: '2'
  }, 1);
  assert.equal(linha.length, 10);
  assert.equal(linha[2], 'F1');
  assert.equal(linha[4], 10);
  assert.equal(linha[8], 'Alzoni');
});

// ---------- garantirCabecalhos_ ----------
test('garantirCabecalhos_ escreve cabecalho quando aba vazia', () => {
  const planilha = criarPlanilhaFalsa();
  const ctx = criarContexto({ planilha });
  ctx.garantirCabecalhos_(planilha);
  const cab = planilha.getRange(1, 1, 1, 10).getValues()[0];
  assert.equal(cab[0], 'DATA');
  assert.equal(cab[9], 'PALETES');
});

test('garantirCabecalhos_ nao sobrescreve aba com cabecalho existente', () => {
  const planilha = criarPlanilhaFalsa({ existente: [['JA', 'EXISTE']] });
  const ctx = criarContexto({ planilha });
  ctx.garantirCabecalhos_(planilha);
  const cab = planilha.getRange(1, 1, 1, 2).getValues()[0];
  assert.equal(cab[0], 'JA');
});

// ---------- salvarLancamentos ----------
test('salvarLancamentos rejeita lista vazia', () => {
  const planilha = criarPlanilhaFalsa();
  const ctx = criarContexto({ planilha });
  assert.throws(() => ctx.salvarLancamentos('Setor', []), /Nenhum lançamento/);
});

test('salvarLancamentos insere novo lancamento na proxima linha livre', () => {
  const planilha = criarPlanilhaFalsa({
    existente: [
      ['DATA', 'HORA', 'FROTA', 'NF', 'QUANTIDADE', 'PRODUTO', 'MOTORISTA/AJUDANTE', 'CAIXAS', 'CONFERENTE', 'PALETES'],
      [new Date(2026, 7, 11, 12), new Date(1899, 11, 30, 8, 0), 'F1', '1', 1, 'P', 'M', 1, 'Alzoni', 1]
    ]
  });
  const ctx = criarContexto({ planilha });
  const msg = ctx.salvarLancamentos('RetornoFrota', [
    { data: '2026-08-11', hora: '09:00', frota: 'F2', nfe: '2', quantidade: '2', produto: 'P2', motorista: 'M2', caixas: '2', conferente: 'João Paulo', paletes: '2' }
  ]);
  assert.match(msg, /1 novo/);
  const linha3 = planilha.getRange(3, 1, 1, 10).getValues()[0];
  assert.equal(linha3[2], 'F2');
});

test('salvarLancamentos atualiza linha existente quando linhaPlanilha informado', () => {
  const planilha = criarPlanilhaFalsa({
    existente: [
      ['DATA', 'HORA', 'FROTA', 'NF', 'QUANTIDADE', 'PRODUTO', 'MOTORISTA/AJUDANTE', 'CAIXAS', 'CONFERENTE', 'PALETES'],
      [new Date(2026, 7, 11, 12), new Date(1899, 11, 30, 8, 0), 'F1', '1', 1, 'P', 'M', 1, 'Alzoni', 1]
    ]
  });
  const ctx = criarContexto({ planilha });
  const msg = ctx.salvarLancamentos('RetornoFrota', [
    { linhaPlanilha: 2, data: '2026-08-11', hora: '10:00', frota: 'F1-EDITADO', nfe: '1', quantidade: '9', produto: 'P', motorista: 'M', caixas: '1', conferente: 'Alzoni', paletes: '1' }
  ]);
  assert.match(msg, /1 atualizado/);
  const linha2 = planilha.getRange(2, 1, 1, 10).getValues()[0];
  assert.equal(linha2[2], 'F1-EDITADO');
});

test('salvarLancamentos rejeita linhaPlanilha duplicada no mesmo lote', () => {
  const planilha = criarPlanilhaFalsa({
    existente: [['DATA', 'HORA', 'FROTA', 'NF', 'QUANTIDADE', 'PRODUTO', 'MOTORISTA/AJUDANTE', 'CAIXAS', 'CONFERENTE', 'PALETES']]
  });
  const ctx = criarContexto({ planilha });
  assert.throws(() => ctx.salvarLancamentos('S', [
    { linhaPlanilha: 2, frota: 'A', data: '2026-08-11' },
    { linhaPlanilha: 2, frota: 'B', data: '2026-08-11' }
  ]), /mais de uma vez/);
});

test('salvarLancamentos rejeita linhaPlanilha alem do limite da planilha', () => {
  const planilha = criarPlanilhaFalsa({ maxRows: 5, existente: [['h']] });
  const ctx = criarContexto({ planilha });
  assert.throws(() => ctx.salvarLancamentos('S', [
    { linhaPlanilha: 999, frota: 'A', data: '2026-08-11' }
  ]), /não existe na planilha/);
});

test('salvarLancamentos propaga erro de frota ausente', () => {
  const planilha = criarPlanilhaFalsa({ existente: [['h']] });
  const ctx = criarContexto({ planilha });
  assert.throws(() => ctx.salvarLancamentos('S', [
    { data: '2026-08-11', frota: '' }
  ]), /Informe a frota/);
});

// ---------- listarLancamentosPorData_ ----------
test('listarLancamentosPorData_ rejeita data em formato invalido', () => {
  const planilha = criarPlanilhaFalsa();
  const ctx = criarContexto({ planilha });
  assert.throws(() => ctx.listarLancamentosPorData_('11/08/2026'), /inválida/);
});

test('listarLancamentosPorData_ retorna vazio quando nao ha dados', () => {
  const planilha = criarPlanilhaFalsa({ existente: [['h']] });
  const ctx = criarContexto({ planilha });
  const resultado = ctx.listarLancamentosPorData_('2026-08-11');
  assert.equal(resultado.length, 0);
});

test('listarLancamentosPorData_ filtra por data e mapeia linhaPlanilha corretamente', () => {
  const planilha = criarPlanilhaFalsa({
    existente: [
      ['h'],
      [new Date(2026, 7, 10, 12), new Date(1899, 11, 30, 7, 0), 'F0', '', '', '', '', '', '', ''],
      [new Date(2026, 7, 11, 12), new Date(1899, 11, 30, 8, 30), 'F1', 'NF1', 3, 'Prod', 'Mot', 2, 'Alzoni', 1]
    ]
  });
  const ctx = criarContexto({ planilha });
  const resultado = ctx.listarLancamentosPorData_('2026-08-11');
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].linhaPlanilha, 3);
  assert.equal(resultado[0].frota, 'F1');
  assert.equal(resultado[0].hora, '08:30');
});

// ---------- doGet / doPost (fluxo completo) ----------
test('doGet sem parametros retorna html da pagina', () => {
  const ctx = criarContexto();
  const saida = ctx.doGet(undefined);
  assert.equal(saida._arquivo, 'index');
  assert.equal(saida._titulo, 'Retorno de Frota');
});

test('doGet com acao=listarRecebimentos retorna JSONP', () => {
  const planilha = criarPlanilhaFalsa({ existente: [['h']] });
  const ctx = criarContexto({ planilha });
  const saida = ctx.doGet({ parameter: { acao: 'listarRecebimentos', data: '2026-08-11', callback: 'cb1' } });
  assert.match(saida._texto, /^cb1\(/);
  assert.match(saida._texto, /"sucesso":true/);
});

test('doGet com data invalida devolve sucesso:false via JSONP (nao lanca)', () => {
  const planilha = criarPlanilhaFalsa({ existente: [['h']] });
  const ctx = criarContexto({ planilha });
  const saida = ctx.doGet({ parameter: { acao: 'listarRecebimentos', data: 'lixo', callback: 'cb2' } });
  assert.match(saida._texto, /"sucesso":false/);
});

test('doPost com payload valido salva e retorna sucesso', () => {
  const planilha = criarPlanilhaFalsa({ existente: [['h']] });
  const ctx = criarContexto({ planilha });
  const payload = JSON.stringify({ setor: 'RetornoFrota', lancamentos: [{ data: '2026-08-11', frota: 'F9' }] });
  const saida = ctx.doPost({ parameter: { payload } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.sucesso, true);
});

test('doPost com fallback text/plain (no-cors) decodifica payload', () => {
  const planilha = criarPlanilhaFalsa({ existente: [['h']] });
  const ctx = criarContexto({ planilha });
  const payloadObj = { setor: 'RetornoFrota', lancamentos: [{ data: '2026-08-11', frota: 'F9' }] };
  const corpoBruto = 'payload=' + encodeURIComponent(JSON.stringify(payloadObj)).replace(/%20/g, '+');
  const saida = ctx.doPost({ postData: { contents: corpoBruto } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.sucesso, true);
});

test('doPost sem payload retorna sucesso:false', () => {
  const ctx = criarContexto();
  const saida = ctx.doPost({});
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.sucesso, false);
  assert.match(corpo.mensagem, /não recebidos/);
});

test('doPost com JSON invalido retorna sucesso:false sem lancar', () => {
  const ctx = criarContexto();
  const saida = ctx.doPost({ parameter: { payload: '{invalido' } });
  const corpo = JSON.parse(saida._texto);
  assert.equal(corpo.sucesso, false);
});
