/**
 * Back-end do recebimento de fornecedor.
 * Cole este arquivo no projeto Apps Script vinculado à planilha.
 */

const CONFIGURACAO = Object.freeze({
  ID_PLANILHA: '12YepnQuYfgKxaOgmPQSLx8qV6nCFRhsKyvtCts9VJiM',
  NOME_ABA: 'RECEBIMENTO',
  CABECALHOS: [
    'DATA',
    'FORNECEDOR',
    'NFE',
    'LOTE',
    'VALIDADE',
    'PRODUTO MASTER',
    'QUANTIDADE DA NOTA',
    'UNIDADE DE MEDIDA',
    'TEMPERATURA',
    'FABRICAÇÃO',
    'CONFERENTE',
    'H DE CHEGA',
    'H DE SAIDA'
  ]
});

/** Exibe o arquivo index.html ao publicar o projeto como aplicativo da web. */
function doGet(e) {
  if (e && e.parameter && e.parameter.acao === 'listarRecebimentos') {
    try {
      return respostaJsonp_(e.parameter.callback, {
        sucesso: true,
        lancamentos: listarRecebimentosPorData_(e.parameter.data)
      });
    } catch (erro) {
      console.error(erro);
      return respostaJsonp_(e.parameter.callback, {
        sucesso: false,
        mensagem: erro.message || String(erro)
      });
    }
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Recebimento de Fornecedor')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Recebe o POST enviado pelo GitHub Pages.
 * Trata o payload vindo como parâmetro ou como corpo de texto puro (no-cors fallback).
 */
function doPost(e) {
  try {
    let textoPayload = "";
    
    // 1. Tenta pegar via parâmetro URL encoded tradicional
    if (e && e.parameter && e.parameter.payload) {
      textoPayload = e.parameter.payload;
    } 
    // 2. Fallback: Se o navegador sanitizou a requisição como text/plain devido ao no-cors
    else if (e && e.postData && e.postData.contents) {
      let conteudoBruto = e.postData.contents;
      if (conteudoBruto.indexOf('payload=') === 0) {
        conteudoBruto = conteudoBruto.substring(8);
        textoPayload = decodeURIComponent(conteudoBruto.replace(/\+/g, '%20'));
      } else {
        textoPayload = conteudoBruto;
      }
    }

    if (!textoPayload) throw new Error('Dados do formulário não recebidos ou vazios.');

    const payload = JSON.parse(textoPayload);
    const mensagem = salvarRecebimentos(payload.setor, payload.lancamentos);
    return respostaJson_({ sucesso: true, mensagem: mensagem });
  } catch (erro) {
    console.error(erro);
    return respostaJson_({ sucesso: false, mensagem: erro.message || String(erro) });
  }
}

/**
 * Recebe os registros enviados pelo index.html e os adiciona à aba RECEBIMENTO.
 */
function salvarRecebimentos(setor, lancamentos) {
  if (!Array.isArray(lancamentos) || !lancamentos.length) {
    throw new Error('Nenhum lançamento foi informado.');
  }

  const aba = obterAbaRecebimento_();
  garantirCabecalhos_(aba);

  const novos = [];
  const atualizacoes = [];
  const linhasAtualizadas = new Set();

  lancamentos.forEach((lancamento, indice) => {
    const valores = converterLancamento_(lancamento, indice + 1);
    const linhaPlanilha = Number(lancamento.linhaPlanilha);

    if (Number.isInteger(linhaPlanilha) && linhaPlanilha >= 2) {
      if (linhaPlanilha > aba.getMaxRows()) {
        throw new Error(`A linha ${linhaPlanilha} não existe na planilha.`);
      }
      if (linhasAtualizadas.has(linhaPlanilha)) {
        throw new Error(`A linha ${linhaPlanilha} foi enviada mais de uma vez.`);
      }
      linhasAtualizadas.add(linhaPlanilha);
      atualizacoes.push({ linha: linhaPlanilha, valores: valores });
      return;
    }

    novos.push(valores);
  });

  atualizacoes.forEach(atualizacao => {
    aba.getRange(atualizacao.linha, 1, 1, CONFIGURACAO.CABECALHOS.length)
      .setValues([atualizacao.valores]);
    formatarLinhas_(aba, atualizacao.linha, 1);
  });

  if (novos.length) {
    const primeiraLinhaLivre = encontrarProximaLinhaDeDados_(aba);
    aba.getRange(primeiraLinhaLivre, 1, novos.length, CONFIGURACAO.CABECALHOS.length)
      .setValues(novos);
    formatarLinhas_(aba, primeiraLinhaLivre, novos.length);
  }

  return `${novos.length} novo(s) e ${atualizacoes.length} atualizado(s) com sucesso.`;
}

function formatarLinhas_(aba, primeiraLinha, quantidadeLinhas) {
  if (quantidadeLinhas <= 0) return;
  aba.getRange(primeiraLinha, 1, quantidadeLinhas, 1).setNumberFormat('dd/MM/yyyy');
  aba.getRange(primeiraLinha, 5, quantidadeLinhas, 1).setNumberFormat('dd/MM/yyyy');
  aba.getRange(primeiraLinha, 10, quantidadeLinhas, 1).setNumberFormat('dd/MM/yyyy');
  aba.getRange(primeiraLinha, 12, quantidadeLinhas, 2).setNumberFormat('HH:mm');
}

function obterAbaRecebimento_() {
  const planilha = SpreadsheetApp.openById(CONFIGURACAO.ID_PLANILHA);
  const aba = planilha.getSheetByName(CONFIGURACAO.NOME_ABA);
  if (!aba) throw new Error(`A aba "${CONFIGURACAO.NOME_ABA}" não foi encontrada.`);
  return aba;
}

function garantirCabecalhos_(aba) {
  const quantidadeColunas = CONFIGURACAO.CABECALHOS.length;
  const primeiraLinha = aba.getRange(1, 1, 1, quantidadeColunas).getDisplayValues()[0];
  const abaVazia = primeiraLinha.every(valor => !valor.trim());

  if (abaVazia) {
    aba.getRange(1, 1, 1, quantidadeColunas).setValues([CONFIGURACAO.CABECALHOS]);
    aba.getRange(1, 1, 1, quantidadeColunas)
      .setFontWeight('bold')
      .setBackground('#143f73')
      .setFontColor('#ffffff');
    aba.setFrozenRows(1);
  }
}

function listarRecebimentosPorData_(dataConsulta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataConsulta || ''))) {
    throw new Error('A data informada é inválida.');
  }

  const aba = obterAbaRecebimento_();
  const ultimaLinha = encontrarProximaLinhaDeDados_(aba) - 1;
  if (ultimaLinha < 2) return [];

  const valores = aba.getRange(2, 1, ultimaLinha - 1, CONFIGURACAO.CABECALHOS.length).getValues();
  const fusoHorario = SpreadsheetApp.openById(CONFIGURACAO.ID_PLANILHA).getSpreadsheetTimeZone();

  const resultado = [];
  for (let i = 0; i < valores.length; i++) {
    const linha = valores[i];
    if (formatarDataParaInput_(linha[0], fusoHorario) === dataConsulta) {
      resultado.push({
        linhaPlanilha: i + 2,
        fornecedor: textoParaTela_(linha[1]),
        nfe: textoParaTela_(linha[2]),
        lote: textoParaTela_(linha[3]),
        validade: formatarDataParaTelaBR_(linha[4], fusoHorario),
        produtoMaster: textoParaTela_(linha[5]),
        quantidadeDaNota: textoParaTela_(linha[6]),
        unidadeDeMedida: textoParaTela_(linha[7]),
        temperatura: textoParaTela_(linha[8]),
        fabricacao: formatarDataParaTelaBR_(linha[9], fusoHorario),
        conferente: textoParaTela_(linha[10]),
        horaChegada: formatarHoraParaTela_(linha[11], fusoHorario),
        horaSaida: formatarHoraParaTela_(linha[12], fusoHorario)
      });
    }
  }
  return resultado;
}

function encontrarProximaLinhaDeDados_(aba) {
  const primeiraLinhaDeDados = 2;
  const totalLinhas = aba.getMaxRows() - primeiraLinhaDeDados + 1;
  if (totalLinhas <= 0) return primeiraLinhaDeDados;

  const valores = aba.getRange(
    primeiraLinhaDeDados,
    1,
    totalLinhas,
    CONFIGURACAO.CABECALHOS.length
  ).getDisplayValues();

  for (let indice = valores.length - 1; indice >= 0; indice--) {
    const possuiLancamento = valores[indice].some(valor => String(valor).trim() !== '');
    if (possuiLancamento) return primeiraLinhaDeDados + indice + 1;
  }

  return primeiraLinhaDeDados;
}

function formatarDataParaInput_(valor, fusoHorario) {
  return valor instanceof Date ? Utilities.formatDate(valor, fusoHorario, 'yyyy-MM-dd') : '';
}

/** Devolve no formato brasileiro para o preenchimento da tabela */
function formatarDataParaTelaBR_(valor, fusoHorario) {
  return valor instanceof Date ? Utilities.formatDate(valor, fusoHorario, 'dd/MM/yyyy') : textoParaTela_(valor);
}

function formatarHoraParaTela_(valor, fusoHorario) {
  return valor instanceof Date ? Utilities.formatDate(valor, fusoHorario, 'HH:mm') : textoParaTela_(valor);
}

function textoParaTela_(valor) {
  return valor === null || valor === undefined ? '' : String(valor);
}

function converterLancamento_(lancamento, numeroLinha) {
  if (!lancamento || typeof lancamento !== 'object') {
    throw new Error(`Lançamento ${numeroLinha} inválido.`);
  }

  const fornecedor = textoSeguro_(lancamento.fornecedor);
  if (!fornecedor) {
    throw new Error(`Informe o fornecedor no lançamento ${numeroLinha}.`);
  }

  return [
    converterData_(lancamento.data, 'data do cabeçalho'),
    fornecedor,
    textoSeguro_(lancamento.nfe),
    textoSeguro_(lancamento.lote),
    converterData_(lancamento.validade, `validade do lançamento ${numeroLinha}`, true),
    textoSeguro_(lancamento.produtoMaster),
    converterQuantidade_(lancamento.quantidadeDaNota, numeroLinha),
    textoSeguro_(lancamento.unidadeDeMedida),
      converterTemperatura_(lancamento.temperatura, numeroLinha),
    converterData_(lancamento.fabricacao, `fabricação do lançamento ${numeroLinha}`, true),
    textoSeguro_(lancamento.conferente),
    converterHora_(lancamento.horaChegada, `hora de chegada do lançamento ${numeroLinha}`),
    converterHora_(lancamento.horaSaida, `hora de saída do lançamento ${numeroLinha}`)
  ];
}

function converterData_(valor, nomeCampo, permiteVazio) {
  if (!valor) {
    if (permiteVazio) return '';
    throw new Error(`Informe a ${nomeCampo}.`);
  }

  // Formato dd/mm/aaaa
  let partes = String(valor).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (partes) {
    const dia = Number(partes[1]);
    const mes = Number(partes[2]) - 1;
    const ano = Number(partes[3]);
    const data = new Date(ano, mes, dia, 12);
    if (data.getFullYear() === ano && data.getMonth() === mes && data.getDate() === dia) {
      return data;
    }
  }

  // Formato yyyy-mm-dd
  partes = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (partes) {
    const ano = Number(partes[1]);
    const mes = Number(partes[2]) - 1;
    const dia = Number(partes[3]);
    const data = new Date(ano, mes, dia, 12);
    if (data.getFullYear() === ano && data.getMonth() === mes && data.getDate() === dia) {
      return data;
    }
  }

  throw new Error(`A ${nomeCampo} é inválida.`);
}

function converterQuantidade_(valor, numeroLinha) {
  if (valor === '' || valor === null || valor === undefined) return '';

  const texto = String(valor).trim();
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  const quantidade = Number(normalizado);

  if (!Number.isFinite(quantidade) || quantidade < 0) {
    throw new Error(`A quantidade da nota no lançamento ${numeroLinha} é inválida.`);
  }
  return quantidade;
}

function converterHora_(valor, nomeCampo) {
  if (!valor) return '';

  const partes = String(valor).match(/^(\d{2}):(\d{2})$/);
  if (!partes || Number(partes[1]) > 23 || Number(partes[2]) > 59) {
    throw new Error(`A ${nomeCampo} é inválida.`);
  }
  return new Date(1899, 11, 30, Number(partes[1]), Number(partes[2]));
}

function textoSeguro_(valor) {
  const texto = String(valor || '').trim();
  return /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
}

/** Converte o campo de temperatura: aceita valores negativos e tenta retornar número. */
function converterTemperatura_(valor, numeroLinha) {
  if (valor === '' || valor === null || valor === undefined) return '';

  const texto = String(valor).trim();
  // Remove símbolo de graus e letras, mantém sinal e separador decimal
  const limpo = texto.replace(/[°º\sA-Za-z]/g, '').replace(/,/g, '.');

  const numero = Number(limpo);
  if (Number.isFinite(numero)) return numero;

  // Se não for número, devolve como texto seguro (evita injeção de fórmulas)
  return textoSeguro_(texto);
}

function respostaJson_(conteudo) {
  return ContentService
    .createTextOutput(JSON.stringify(conteudo))
    .setMimeType(ContentService.MimeType.JSON);
}

function respostaJsonp_(callback, conteudo) {
  if (!/^[A-Za-z_$][\w$]*$/.test(String(callback || ''))) {
    throw new Error('Callback inválido.');
  }
  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(conteudo)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}