const API_URL = "https://script.google.com/macros/s/AKfycbyg2-R64OfUeSZy_Cs04Ek97oYeQQ52R9SCgMY9HaYgF9X5CldDkOa7erKKQT7-ZUxAcQ/exec";

// Estados Globais
let aluno = { nome: "", telefone: "", whatsapp: false };
let grupoAtual = 1;
let questoesSorteadas = [];
let indiceAtual = 0;
let chartInstance = null;

// Acumuladores de Performance
let notaGrupo = 0;
let tagsGrupo = new Set();
let tempoInicioGrupo;

let notaTotal = 0;
let tagsGerais = new Set();
let tempoTotalMs = 0; 

// Elementos
const telaLogin = document.getElementById('tela-login');
const telaProva = document.getElementById('tela-prova');
const telaDashboard = document.getElementById('tela-dashboard');
const btnConfirmar = document.getElementById('btn-confirmar');
const btnPular = document.getElementById('btn-pular');
let timerInterval;

// --- SISTEMA DE SALVAMENTO AUTOMÁTICO (LOCALSTORAGE) ---
function salvarEstado() {
    if (!aluno.telefone) return;
    const estado = {
        aluno, 
        grupoAtual, 
        questoesSorteadas, 
        indiceAtual, 
        notaGrupo,
        tagsGrupo: Array.from(tagsGrupo), 
        notaTotal, 
        tagsGerais: Array.from(tagsGerais),
        tempoTotalMs, 
        tempoDecorridoGrupo: Date.now() - tempoInicioGrupo
    };
    localStorage.setItem('excel_ead_' + aluno.telefone, JSON.stringify(estado));
}

function restaurarProgresso(estadoStr) {
    const estado = JSON.parse(estadoStr);
    
    aluno = estado.aluno;
    grupoAtual = estado.grupoAtual;
    questoesSorteadas = estado.questoesSorteadas;
    indiceAtual = estado.indiceAtual;
    notaGrupo = estado.notaGrupo;
    tagsGrupo = new Set(estado.tagsGrupo);
    notaTotal = estado.notaTotal;
    tagsGerais = new Set(estado.tagsGerais);
    tempoTotalMs = estado.tempoTotalMs;
    
    // Ajusta o cronômetro para abater o tempo que já havia passado
    tempoInicioGrupo = Date.now() - (estado.tempoDecorridoGrupo || 0);

    // Oculta login e vai direto para a prova
    telaLogin.classList.remove('ativa'); telaLogin.classList.add('oculta');
    telaDashboard.classList.remove('ativa'); telaDashboard.classList.add('oculta');
    telaProva.classList.remove('oculta'); telaProva.classList.add('ativa');
    
    document.getElementById('indicador-grupo').textContent = `Módulo ${grupoAtual}`;
    
    timerInterval = setInterval(atualizarCronometro, 1000);
    renderizarQuestao();
}

// 1. INÍCIO DO SISTEMA
document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const telefoneInput = document.getElementById('aluno-telefone').value;

    // Verifica se há progresso salvo para este telefone
    const progressoSalvo = localStorage.getItem('excel_ead_' + telefoneInput);
    if (progressoSalvo) {
        const querContinuar = confirm("Encontramos um progresso salvo para este número de telefone. Deseja continuar de onde parou?");
        if (querContinuar) {
            restaurarProgresso(progressoSalvo);
            return; // Interrompe o fluxo normal de nova prova
        } else {
            localStorage.removeItem('excel_ead_' + telefoneInput); // Limpa para começar do zero
        }
    }

    aluno.nome = document.getElementById('aluno-nome').value;
    aluno.telefone = telefoneInput;
    aluno.whatsapp = document.getElementById('aluno-whatsapp').checked;
    
    // Define o módulo inicial com base na seleção do dropdown
    grupoAtual = parseInt(document.getElementById('modulo-selecionado').value);
    
    const btnIniciar = document.getElementById('btn-iniciar');
    btnIniciar.textContent = `Carregando Módulo ${grupoAtual}...`;
    btnIniciar.disabled = true;

    // GRAVAÇÃO IMEDIATA (Envio Seguro Anti-Bloqueio)
    fetch(API_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
            nome: aluno.nome, telefone: aluno.telefone, whatsapp: aluno.whatsapp,
            fase: `0 - Login (Iniciou pelo Módulo ${grupoAtual})`, nota: 0, tempo: "00:00", errosTags: []
        })
    }).catch(console.error);

    await prepararGrupo(grupoAtual);
});

// 2. PREPARAR CADA GRUPO
async function prepararGrupo(numGrupo) {
    try {
        let response = await fetch(`./dados/questoes_grupo${numGrupo}_completo.json`);
        if (!response.ok) {
            response = await fetch(`./dados/questoes_grupo${numGrupo}_atualizado.json`);
        }
        
        if (!response.ok) throw new Error("Ficheiro JSON não encontrado.");
        
        const banco = await response.json();
        
        sortearQuestoes(banco);
        
        notaGrupo = 0;
        tagsGrupo.clear();
        indiceAtual = 0;
        
        telaLogin.classList.remove('ativa'); telaLogin.classList.add('oculta');
        telaDashboard.classList.remove('ativa'); telaDashboard.classList.add('oculta');
        telaProva.classList.remove('oculta'); telaProva.classList.add('ativa');
        
        document.getElementById('indicador-grupo').textContent = `Módulo ${numGrupo}`;
        
        tempoInicioGrupo = Date.now();
        timerInterval = setInterval(atualizarCronometro, 1000);
        
        salvarEstado(); // Salva o início do novo grupo
        renderizarQuestao();
    } catch (e) {
        alert("Erro crítico: O ficheiro do Grupo " + numGrupo + " não foi encontrado na pasta /dados/. Verifique se fez o upload correto no GitHub.");
        console.error(e);
        document.getElementById('btn-iniciar').textContent = "Iniciar Avaliação";
        document.getElementById('btn-iniciar').disabled = false;
    }
}

function sortearQuestoes(banco) {
    questoesSorteadas = [];
    
    const normais = banco.filter(q => !q.id.includes('_D'));
    const dificeis = banco.filter(q => q.id.includes('_D'));

    [1, 2, 3, 4].forEach(tipo => {
        let filtro = normais.filter(q => q.tipo === tipo).sort(() => Math.random() - 0.5);
        questoesSorteadas = questoesSorteadas.concat(filtro.slice(0, 3));
    });
    
    questoesSorteadas.sort(() => Math.random() - 0.5);

    if (dificeis.length > 0) {
        let dificeisSorteadas = dificeis.sort(() => Math.random() - 0.5).slice(0, 2);
        questoesSorteadas = questoesSorteadas.concat(dificeisSorteadas);
    }
}

function atualizarCronometro() {
    const diff = new Date(Date.now() - tempoInicioGrupo);
    const m = String(diff.getMinutes()).padStart(2, '0');
    const s = String(diff.getSeconds()).padStart(2, '0');
    document.getElementById('cronometro').textContent = `${m}:${s}`;
}

// 3. RENDERIZAÇÃO
function renderizarQuestao() {
    const q = questoesSorteadas[indiceAtual];
    
    const badgeDificil = q.id.includes('_D') ? " 🔥 Desafio Final" : "";
    document.getElementById('contador-questao').textContent = `Questão ${indiceAtual + 1} de ${questoesSorteadas.length}${badgeDificil}`;
    
    document.getElementById('feedback-erro').classList.add('oculta');

    // EXIBE O CÓDIGO DA QUESTÃO AQUI
    let html = `<div style="font-size: 14px; color: #6c757d; margin-bottom: 10px; font-weight: 500;">Código da Questão: <span style="color: #107c41;">${q.id}</span></div>`;
    
    html += `<div class="contexto"><strong>Cenário:</strong> ${q.contexto}</div><p><strong>Desafio:</strong> ${q.enunciado}</p>`;
    
    if (q.arquivo_download) html += `<a href="./arquivos/${q.arquivo_download}" target="_blank" class="btn-secundario" style="display:inline-block; margin-bottom:15px; text-decoration:none;">📥 Baixar Planilha Base</a><br>`;

    if (q.tipo === 1) {
        html += `<input type="text" id="resposta-t1" placeholder="Resultado exato..." autocomplete="off">`;
    } else if (q.tipo === 2) {
        let alts = q.alternativas.map((texto, i) => ({ texto, idx: i })).sort(() => Math.random() - 0.5);
        html += `<div id="opcoes-t2">` + alts.map(a => `<label style="display:block; margin:10px 0; background:#f8f9fa; padding:10px; border-radius:4px; cursor:pointer;"><input type="radio" name="resposta-t2" value="${a.idx}"> ${a.texto}</label>`).join('') + `</div>`;
    } else if (q.tipo === 3) {
        let f = q.estrutura;
        q.lacunas_esperadas.forEach((_, i) => f = f.replace(/_{2,}/, `<input type="text" id="lacuna-${i}" style="width:100px; padding:5px; text-align:center;" autocomplete="off">`));
        html += `<div style="font-family: monospace; font-size:18px; background:#e9ecef; padding:15px; border-radius:4px; overflow-x:auto;">${f}</div>`;
    } else if (q.tipo === 4) {
        html += `<input type="text" id="resposta-t4" placeholder="=FÓRMULA(...)" autocomplete="off">`;
    }
    document.getElementById('area-questao').innerHTML = html;
}

// 4. VALIDAÇÃO
btnConfirmar.onclick = () => {
    const q = questoesSorteadas[indiceAtual];
    let acertou = false;

    if (q.tipo === 1) {
        let inputUsuario = document.getElementById('resposta-t1').value.trim().toLowerCase();
        let gabarito = q.resultado_esperado.toString().trim().toLowerCase();
        
        let numUsuario = parseFloat(inputUsuario.replace(/\./g, '').replace(',', '.'));
        let numGabarito = parseFloat(gabarito.replace(/\./g, '').replace(',', '.'));
        
        if (!isNaN(numUsuario) && !isNaN(numGabarito) && inputUsuario !== "" && gabarito !== "") {
            if (numUsuario === numGabarito) acertou = true;
        } else {
            if (inputUsuario === gabarito) acertou = true;
        }

    } else if (q.tipo === 2) {
        const sel = document.querySelector('input[name="resposta-t2"]:checked');
        if (!sel) return alert("Selecione uma opção!");
        if (parseInt(sel.value) === q.resposta_correta) acertou = true;

    } else if (q.tipo === 3) {
        let todasPerfeitas = true;
        let quaseCerta = false;
        let erroGrave = false;

        q.lacunas_esperadas.forEach((esp, i) => {
            let digitado = document.getElementById(`lacuna-${i}`).value.trim().toUpperCase().replace(/'/g, '"').replace(/\s+/g, " ");
            let esperado = esp.trim().toUpperCase().replace(/'/g, '"').replace(/\s+/g, " ");
            
            const res = calcularSimilaridade(digitado, esperado);
            
            if (res.distancia > 0) {
                todasPerfeitas = false;
                
                if (digitado.length === 0) {
                    erroGrave = true;
                } 
                else if (res.distancia === 1 || (res.distancia <= 2 && res.percentual >= 70)) {
                    quaseCerta = true;
                } else {
                    erroGrave = true;
                }
            }
        });

        if (todasPerfeitas) {
            acertou = true;
        } else if (quaseCerta && !erroGrave) {
            alert("Você está muito perto! Há apenas 1 ou 2 letras erradas, um espaço sobrando ou um erro de pontuação na sintaxe. Revise sua resposta antes de confirmar.");
            return; 
        } else {
            acertou = false;
        }

    } else if (q.tipo === 4) {
        let resp = document.getElementById('resposta-t4').value.trim();
        
        acertou = q.respostas_aceitas.some(regex => new RegExp(regex.replace("(?i)", ""), "i").test(resp));

        if (!acertou && resp.length > 0) {
            let gabaritoBase = q.respostas_aceitas[0];
            let regexLimpa = gabaritoBase.replace("(?i)", "").replace(/\\s\*/g, "").replace(/\\/g, "");
            let respLimpa = resp.replace(/\s+/g, ""); 
            
            let res = calcularSimilaridade(respLimpa.toUpperCase(), regexLimpa.toUpperCase());
            
            if (res.distancia <= 3 && res.percentual >= 75) {
                alert("Você está muito perto! Há um pequeno erro de digitação no nome da função ou na pontuação. Revise antes de confirmar.");
                return; 
            }
        }
    }

    if (acertou) {
        notaGrupo++;
        avancarQuestao();
    } else {
        q.tags.forEach(t => tagsGrupo.add(t));
        if (q.tipo === 2) {
            alert("Resposta Incorreta!\nDica: " + q.dica_erro);
            avancarQuestao();
        } else {
            const div = document.getElementById('feedback-erro');
            div.innerHTML = `<strong>Incorreto.</strong> Tente de novo ou pule.<br>💡 <em>${q.dica || q.dica_validacao || "Revise a sintaxe."}</em>`;
            div.classList.remove('oculta');
        }
    }
};

btnPular.onclick = () => {
    const q = questoesSorteadas[indiceAtual];
    q.tags.forEach(t => tagsGrupo.add(t));
    alert(`Questão pulada (Erro registrado).\n\nDica: ${q.dica || q.dica_erro || q.dica_validacao}`);
    avancarQuestao();
};

function avancarQuestao() {
    indiceAtual++;
    if (indiceAtual < questoesSorteadas.length) {
        salvarEstado(); 
        renderizarQuestao();
    } else {
        finalizarGrupo();
    }
}

// 5. TRANSIÇÕES DE GRUPO E API
async function finalizarGrupo() {
    clearInterval(timerInterval);
    const tempoFinalStr = document.getElementById('cronometro').textContent;
    tempoTotalMs += (Date.now() - tempoInicioGrupo); 
    
    notaTotal += notaGrupo;
    tagsGrupo.forEach(t => tagsGerais.add(t));

    salvarEstado(); 

    fetch(API_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
            nome: aluno.nome, telefone: aluno.telefone, whatsapp: aluno.whatsapp,
            fase: `Módulo ${grupoAtual}`, nota: notaGrupo, tempo: tempoFinalStr, errosTags: Array.from(tagsGrupo)
        })
    }).catch(console.error);

    telaProva.classList.remove('ativa'); telaProva.classList.add('oculta');
    telaDashboard.classList.remove('oculta'); telaDashboard.classList.add('ativa');
    
    document.getElementById('titulo-dashboard').textContent = `Diagnóstico Parcial - Módulo ${grupoAtual}`;
    document.getElementById('nota-maxima').textContent = questoesSorteadas.length;
    
    gerarDash(notaGrupo, questoesSorteadas.length, Array.from(tagsGrupo));

    const btnAcao = document.getElementById('btn-acao-dashboard');
    if (grupoAtual < 5) {
        btnAcao.textContent = `Avançar para o Módulo ${grupoAtual + 1}`;
        btnAcao.onclick = () => {
            grupoAtual++;
            prepararGrupo(grupoAtual);
        };
    } else {
        btnAcao.textContent = "Ver Diagnóstico Final Consolidado";
        btnAcao.onclick = finalizarAvaliacaoCompleta;
    }
}

async function finalizarAvaliacaoCompleta() {
    const totalM = String(Math.floor(tempoTotalMs / 60000)).padStart(2, '0');
    const totalS = String(Math.floor((tempoTotalMs % 60000) / 1000)).padStart(2, '0');
    const tempoTotalStr = `${totalM}:${totalS}`;

    document.getElementById('titulo-dashboard').textContent = "Diagnóstico Final (Módulos 1 ao 5)";
    document.getElementById('nota-maxima').textContent = "70"; 
    document.getElementById('tempo-final').textContent = tempoTotalStr;

    if(aluno.telefone) localStorage.removeItem('excel_ead_' + aluno.telefone); 

    fetch(API_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
            nome: aluno.nome, telefone: aluno.telefone, whatsapp: aluno.whatsapp,
            fase: `Resultado Final Consolidado`, nota: notaTotal, tempo: tempoTotalStr, errosTags: Array.from(tagsGerais)
        })
    }).catch(console.error);

    gerarDash(notaTotal, 70, Array.from(tagsGerais));

    const btnAcao = document.getElementById('btn-acao-dashboard');
    btnAcao.textContent = "Salvar Diagnóstico Final em PDF";
    btnAcao.onclick = () => {
        btnAcao.style.display = 'none';
        html2pdf().set({ margin: 0.5, filename: `${aluno.nome.replace(/\s+/g, '_')}_Excel.pdf` }).from(document.getElementById('tela-dashboard')).save().then(() => btnAcao.style.display = 'block');
    };
}

// 6. GERAÇÃO GRÁFICA
function gerarDash(nota, maximo, arrayErros) {
    document.getElementById('nota-final').textContent = nota;
    document.getElementById('tempo-final').textContent = document.getElementById('cronometro').textContent;

    const ul = document.getElementById('lista-tags-erro');
    ul.innerHTML = arrayErros.length === 0 
        ? "<li style='color:#107c41; font-weight:bold;'>Excepcional! Nenhuma falha identificada.</li>"
        : arrayErros.map(tag => `<li>Dominar melhor a função: <strong>${tag}</strong></li>`).join('');

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(document.getElementById('grafico-desempenho').getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Acertos', 'Erros / Pulos'], datasets: [{ data: [nota, maximo - nota], backgroundColor: ['#107c41', '#dc3545'] }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// 7. FUNÇÕES AUXILIARES (Algoritmo de Similaridade)
function calcularSimilaridade(s1, s2) {
    if (s1 === s2) return { percentual: 100, distancia: 0 };
    const len1 = s1.length, len2 = s2.length;
    if (len1 === 0 || len2 === 0) return { percentual: 0, distancia: Math.max(len1, len2) };

    const matriz = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
    for (let i = 0; i <= len1; i++) matriz[0][i] = i;
    for (let j = 0; j <= len2; j++) matriz[j][0] = j;

    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const indicador = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matriz[j][i] = Math.min(
                matriz[j][i - 1] + 1, 
                matriz[j - 1][i] + 1, 
                matriz[j - 1][i - 1] + indicador 
            );
        }
    }
    const distancia = matriz[len2][len1];
    const maxLen = Math.max(len1, len2);
    return {
        distancia: distancia,
        percentual: ((maxLen - distancia) / maxLen) * 100
    };
}