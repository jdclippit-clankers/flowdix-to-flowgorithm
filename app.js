const downloadBtn = document.getElementById('download');
const dropzone = document.getElementById('dropzone');

let lastXml = '';
let loadedName = 'converted';
downloadBtn.disabled = true;

const hiddenInput = document.createElement('input');
hiddenInput.type = 'file';
hiddenInput.accept = '.fdxn,.json';
hiddenInput.style.display = 'none';
document.body.appendChild(hiddenInput);

function handleFile(f) {
  if (!f) return;
  dropzone.classList.add("uploading");
  const r = new FileReader();
  r.onload = () => {
    let data;
    try { data = JSON.parse(r.result); } catch (e) { alert('Invalid JSON: ' + e.message); return; }
    lastXml = convertData(data);
    downloadBtn.disabled = false;
    dropzone.classList.remove("uploading");
    loadedName = f.name.replace(/\.fdxn$/i, '');
    dropzone.innerHTML = '<div class="circle"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/></svg></div><span>' + f.name + '</span>';
    downloadNow();
  };
  r.readAsText(f);
}

dropzone.addEventListener('click', () => hiddenInput.click());
hiddenInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

if (dropzone) {
  ['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('over'); }));
  dropzone.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function convertNode(node, indent) {
  const I = indent;
  switch (node.kind) {
    case 'start':
    case 'end':
      return '';
    case 'declare': {
      const m = String(node.variableName).match(/^(.*)\[(\d+)\]$/);
      if (m) {
        return `${I}<declare name="${esc(m[1])}" type="${esc(node.variableType)}" array="True" size="${m[2]}"/>\n`;
      }
      return `${I}<declare name="${esc(node.variableName)}" type="${esc(node.variableType)}" array="False" size=""/>\n`;
    }
    case 'comment':
      return `${I}<comment text="${esc(node.text)}"/>\n`;
    case 'assign':
      return `${I}<assign variable="${esc(node.variable)}" expression="${esc(node.expression)}"/>\n`;
    case 'input':
      return `${I}<input variable="${esc(node.variable)}"/>\n`;
    case 'output':
      return `${I}<output expression="${esc(node.expression)}" newline="${node.newline ? 'True' : 'False'}"/>\n`;
    case 'if': {
      let s = `${I}<if expression="${esc(node.condition)}">\n`;
      s += `${I}  <then>\n`;
      (node.trueBody || []).forEach(n => { s += convertNode(n, I + '    '); });
      s += `${I}  </then>\n`;
      s += `${I}  <else>\n`;
      (node.falseBody || []).forEach(n => { s += convertNode(n, I + '    '); });
      s += `${I}  </else>\n`;
      s += `${I}</if>\n`;
      return s;
    }
    case 'while': {
      let s = `${I}<while expression="${esc(node.condition)}">\n`;
      (node.body || []).forEach(n => { s += convertNode(n, I + '  '); });
      s += `${I}</while>\n`;
      return s;
    }
    case 'for': {
      let s = `${I}<for variable="${esc(node.variable)}" start="${esc(node.start)}" end="${esc(node.end)}" direction="inc" step="${esc(node.step)}">\n`;
      (node.body || []).forEach(n => { s += convertNode(n, I + '  '); });
      s += `${I}</for>\n`;
      return s;
    }
    case 'call': {
      const args = (node.parameters || []).join(', ');
      return `${I}<call expression="${esc(node.function)}(${args})"/>\n`;
    }
    default:
      return `${I}<!-- unsupported node: ${esc(node.kind)} -->\n`;
  }
}

function convertRoutine(r) {
  const type = r.kind === 'function' || r.kind === 'procedure' ? (r.returnType || 'None') : 'None';
  const retVar = (r.kind === 'function' || r.kind === 'procedure') ? (r.returnExpression || '').replace(/[^a-zA-Z0-9_]/g,'') : '';
  let s = `    <function name="${esc(r.name)}" type="${esc(type === 'none' ? 'None' : type)}" variable="${esc(retVar)}">\n`;
  s += `        <parameters>\n`;
  (r.parameters || []).forEach(p => {
    const arr = p.shape && p.shape.startsWith('array') ? 'True' : 'False';
    s += `            <parameter name="${esc(p.name)}" type="${esc(p.type)}" array="${arr}"/>\n`;
  });
  s += `        </parameters>\n`;
  s += `        <body>\n`;
  (r.body || []).forEach(n => { s += convertNode(n, '            '); });
  s += `        </body>\n`;
  s += `    </function>\n`;
  return s;
}

function convertData(data) {
  const prog = data.document && data.document.program ? data.document.program : {};
  const routines = prog.routines || [];
  const main = routines.find(r => r.kind === 'main') || { body: prog.body || [], name: 'Main' };
  let xml = '<?xml version="1.0"?>\n<flowgorithm fileversion="4.2">\n';
  xml += '    <attributes>\n';
  xml += '        <attribute name="name" value="converted"/>\n';
  xml += '        <attribute name="authors" value="FlowDIX converter"/>\n';
  xml += '        <attribute name="about" value=""/>\n';
  xml += '        <attribute name="saved" value=""/>\n';
  xml += '        <attribute name="created" value=""/>\n';
  xml += '        <attribute name="edited" value=""/>\n';
  xml += '    </attributes>\n';
  xml += `    <function name="Main" type="None" variable="">\n`;
  xml += `        <parameters/>\n`;
  xml += `        <body>\n`;
  (main.body || []).forEach(n => { xml += convertNode(n, '            '); });
  xml += `        </body>\n`;
  xml += `    </function>\n`;
  routines.filter(r => r.kind !== 'main').forEach(r => { xml += convertRoutine(r); });
  xml += '</flowgorithm>\n';
  return xml;
}

function downloadNow() {
  if (!lastXml) return;
  const blob = new Blob([lastXml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = loadedName + '.fprg';
  a.click();
  URL.revokeObjectURL(url);
}

downloadBtn.addEventListener('click', downloadNow);
