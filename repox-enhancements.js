/* RepoX Enhancements – compatível com o get-files.js do usuário (retorna ARRAY) */
(() => {
  const el = (s, r=document)=>r.querySelector(s);
  const els = (s, r=document)=>[...r.querySelectorAll(s)];

  // Dependências
  const injectOnce = (tagName, attrs) => {
    if (attrs.href && [...document.querySelectorAll(tagName)].some(n=>n.getAttribute('href')===attrs.href)) return;
    if (attrs.src  && [...document.querySelectorAll(tagName)].some(n=>n.getAttribute('src')===attrs.src)) return;
    const n = document.createElement(tagName);
    Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));
    document.head.appendChild(n);
  };
  injectOnce('link', { rel:'stylesheet', href:'https://unpkg.com/prismjs@1.29.0/themes/prism.css' });
  injectOnce('script', { src:'https://unpkg.com/prismjs@1.29.0/components/prism-core.min.js', defer:'' });
  injectOnce('script', { src:'https://unpkg.com/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js', defer:'' });
  const pdfTag = document.createElement('script');
  pdfTag.src = 'https://unpkg.com/pdfjs-dist@4.6.82/build/pdf.min.js';
  pdfTag.onload = () => { window.pdfjsLib && (pdfjsLib.GlobalWorkerOptions.workerSrc='https://unpkg.com/pdfjs-dist@4.6.82/build/pdf.worker.min.js'); };
  document.head.appendChild(pdfTag);

  // Banner offline
  let offline = el('#offlineBanner');
  if (!offline) {
    offline = document.createElement('div');
    offline.id = 'offlineBanner';
    offline.className = 'offline';
    offline.textContent = 'Sem internet. Algumas ações podem não funcionar.';
    document.body.prepend(offline);
  }
  const updateOffline = () => offline.classList.toggle('show', !navigator.onLine);
  window.addEventListener('online', updateOffline);
  window.addEventListener('offline', updateOffline);
  updateOffline();

  // Template se não existir
  if (!el('#file-card-tpl')) {
    const tpl = document.createElement('template');
    tpl.id = 'file-card-tpl';
    tpl.innerHTML = `<article class="card">
      <div class="thumb-wrap">
        <canvas class="thumb-canvas" width="480" height="270"></canvas>
        <div class="thumb-overlay">
          <span class="badge filetype"></span>
          <span class="filename"></span>
        </div>
        <button class="play-toggle hidden" aria-label="Reproduzir/Pausar">▶</button>
        <button class="fs-toggle hidden" aria-label="Tela cheia">⛶</button>
      </div>
      <div class="card-body">
        <div class="meta">
          <span class="owner"></span>
          <time class="when"></time>
        </div>
        <div class="actions">
          <button class="like-btn">♥ <span class="count">0</span></button>
          <button class="comment-btn">💬</button>
          <a class="download-btn" target="_blank" rel="noopener">⬇</a>
        </div>
      </div>
    </article>`;
    document.body.appendChild(tpl);
  }

  // Utilities
  const TYPE = { VIDEO:'video', IMAGE:'image', CODE:'code', SHEET:'sheet', DECK:'deck', DOC:'doc', PDF:'pdf', HTML:'html', OTHER:'other' };
  const EXT_MAP = { mp4:'video', webm:'video', mov:'video', m4v:'video', avi:'video', mkv:'video',
    jpg:'image', jpeg:'image', png:'image', gif:'image', webp:'image', svg:'image', bmp:'image',
    js:'code', ts:'code', jsx:'code', tsx:'code', py:'code', java:'code', c:'code', cpp:'code', rs:'code', go:'code', rb:'code', php:'code', html:'html', css:'code', json:'code', yml:'code', yaml:'code', md:'doc', txt:'doc',
    xls:'sheet', xlsx:'sheet', csv:'sheet', ods:'sheet',
    ppt:'deck', pptx:'deck', key:'deck', odp:'deck',
    rtf:'doc', pdf:'pdf', doc:'doc', docx:'doc'
  };
  const detectType = (it) => {
    if (it.type && (it.type==='video' || it.type==='image')) return it.type;
    return EXT_MAP[(it.name?.split('.').pop()||'').toLowerCase()] || TYPE.OTHER;
  };

  const draw = {
    async video(c, url){
      const v = document.createElement('video');
      v.src = url; v.muted = true; v.crossOrigin="anonymous";
      await new Promise(r=>v.addEventListener('loadeddata', r, {once:true}));
      try { v.currentTime = Math.min(1, (v.duration||2)/2); } catch {}
      await new Promise(r=>v.addEventListener('seeked', r, {once:true}));
      const ctx = c.getContext('2d');
      const ratio = v.videoWidth / v.videoHeight || (16/9);
      c.width = 480; c.height = Math.round(480/ratio);
      ctx.drawImage(v,0,0,c.width,c.height);
    },
    async image(c, url){
      const img = new Image(); img.crossOrigin="anonymous"; img.src = url;
      await img.decode().catch(()=>{});
      const ctx = c.getContext('2d');
      const ratio = (img.naturalWidth||16)/(img.naturalHeight||9);
      c.width = 480; c.height = Math.round(480/ratio);
      ctx.drawImage(img,0,0,c.width,c.height);
    },
    async pdf(c, url){
      if (!window.pdfjsLib) return draw.icon(c,'PDF');
      const pdf = await pdfjsLib.getDocument(url).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({scale:1});
      const scale = 480/vp.width;
      const viewport = page.getViewport({scale});
      c.width = viewport.width; c.height = viewport.height;
      await page.render({canvasContext:c.getContext('2d'), viewport}).promise;
    },
    async html(c){ return draw.icon(c,'HTML'); },
    async code(c, it){
      const code = await fetch(it.url).then(r=>r.text()).catch(()=>it.name||'');
      const snippet = code.split('\n').slice(0,12).join('\n');
      const ctx = c.getContext('2d'); const W=480,H=270;
      c.width=W; c.height=H; ctx.fillStyle='#0b1020'; ctx.fillRect(0,0,W,H);
      ctx.font='12px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.fillStyle='#e5e7eb';
      let y=18; for(const line of snippet.split('\n')){ ctx.fillText(line.slice(0,90), 10, y); y+=16; if(y>H-10) break; }
    },
    async sheet(c){ return draw.icon(c,'SHEET'); },
    async deck(c){ return draw.icon(c,'SLIDES'); },
    async doc(c){ return draw.icon(c,'DOC'); },
    async icon(c, label){
      const ctx=c.getContext('2d'); c.width=480; c.height=270;
      ctx.fillStyle='#0b1020'; ctx.fillRect(0,0,c.width,c.height);
      ctx.fillStyle='#fff'; ctx.font='bold 22px system-ui, -apple-system, Segoe UI, Roboto';
      const w = ctx.measureText(label).width; ctx.fillText(label, (c.width-w)/2, c.height/2);
    }
  };

  function openViewer(item){
    const k = detectType(item);
    if (k==='pdf'){
      const w=window.open('','_blank');
      w.document.write(`<style>html,body{height:100%;margin:0}</style><canvas id="c"></canvas><script src="https://unpkg.com/pdfjs-dist@4.6.82/build/pdf.min.js"></script><script>pdfjsLib.GlobalWorkerOptions.workerSrc='https://unpkg.com/pdfjs-dist@4.6.82/build/pdf.worker.min.js';(async()=>{const url=${JSON.stringify(item.url)};const pdf=await pdfjsLib.getDocument(url).promise;const page=await pdf.getPage(1);const vp=page.getViewport({scale:1.4});const c=document.getElementById('c');c.width=vp.width;c.height=vp.height;await page.render({canvasContext:c.getContext('2d'), viewport: vp}).promise;})();</script>`);
    } else if (k==='html'){
      const w=window.open('','_blank'); w.document.write(`<iframe src=${JSON.stringify(item.url)} sandbox="allow-same-origin allow-scripts" style="border:0;width:100vw;height:100vh"></iframe>`);
    } else if (k==='code'){
      const w=window.open('','_blank'); w.document.write(`<link rel="stylesheet" href="https://unpkg.com/prismjs@1.29.0/themes/prism.css"><pre><code class="language-${(item.name||'').split('.').pop()||''}"></code></pre><script src="https://unpkg.com/prismjs@1.29.0/components/prism-core.min.js"></script><script src="https://unpkg.com/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js"></script><script>fetch(${JSON.stringify(item.url)}).then(r=>r.text()).then(t=>{document.querySelector('code').textContent=t;Prism.highlightAll();});</script>`);
    } else {
      window.open(item.url, '_blank');
    }
  }

  function createCard(item){
    const tpl = el('#file-card-tpl');
    const node = tpl.content.firstElementChild.cloneNode(true);
    const canvas = el('canvas', node);
    const filetype = el('.filetype', node);
    const filename = el('.filename', node);
    const owner = el('.owner', node);
    const when = el('.when', node);
    const likeCount = el('.like-btn .count', node);
    const downloadBtn = el('.download-btn', node);
    const playBtn = el('.play-toggle', node);
    const fsBtn = el('.fs-toggle', node);

    filename.textContent = item.name || item.title || '';
    const k = detectType(item);
    filetype.textContent = k.toUpperCase();
    owner.textContent = item.profile || "unknown";
    when.textContent = item.date || new Date().toISOString().slice(0,10);
    likeCount.textContent = item.likes ?? 0;
    downloadBtn.href = item.url;

    const thumbers = {
      video: ()=>draw.video(canvas, item.url),
      image: ()=>draw.image(canvas, item.url),
      pdf: ()=>draw.pdf(canvas, item.url),
      html: ()=>draw.html(canvas, item.url),
      code: ()=>draw.code(canvas, item),
      sheet: ()=>draw.sheet(canvas, item),
      deck: ()=>draw.deck(canvas, item),
      doc: ()=>draw.doc(canvas, item),
      other: ()=>draw.icon(canvas,'ARQUIVO')
    };
    (thumbers[k] || thumbers.other)().catch(()=>draw.icon(canvas,'ARQUIVO'));

    if (k==='video'){
      const v = document.createElement('video');
      v.src = item.url; v.playsInline = true; v.style.display='none';
      node.querySelector('.thumb-wrap').appendChild(v);
      let playing=false;
      el('.play-toggle', node).classList.remove('hidden');
      el('.fs-toggle', node).classList.remove('hidden');
      el('.play-toggle', node).addEventListener('click', async ()=>{
        if (!playing){ await v.play(); el('.play-toggle', node).textContent='⏸'; playing=true; }
        else { v.pause(); el('.play-toggle', node).textContent='▶'; playing=false; }
      });
      el('.fs-toggle', node).addEventListener('click', ()=>{
        canvas.classList.toggle('fullscreen'); v.classList.toggle('fullscreen');
        el('.fs-toggle', node).textContent = canvas.classList.contains('fullscreen') ? '🗗' : '⛶';
      });
      const slider = document.createElement('input');
      slider.type='range'; slider.min=0; slider.max=1000; slider.value=0;
      slider.style.position='absolute'; slider.style.left='8px'; slider.style.right='80px'; slider.style.bottom='8px';
      node.querySelector('.thumb-wrap').appendChild(slider);
      let pendingSeek=null;
      slider.addEventListener('change', ()=>{
        const frac = slider.value/1000; pendingSeek = frac*(v.duration||0);
        if (!isNaN(pendingSeek)) v.currentTime = pendingSeek;
      });
      v.addEventListener('timeupdate', ()=>{
        if (pendingSeek==null) slider.value = Math.round((v.currentTime/(v.duration||1))*1000);
        else pendingSeek=null;
      });
    }

    node.querySelector('.thumb-wrap').addEventListener('click', ()=>openViewer(item));
    return node;
  }

  function renderGrid(container, items){
    container.innerHTML='';
    items.forEach(it => container.appendChild(createCard(it)));
  }

  async function safeFetch(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('API error:', e);
      return [];
    }
  }

  // Feed: usa o ARRAY do endpoint
  (async () => {
    const feedEl = el('#feed');
    if (feedEl){
      const arr = await safeFetch('/api/get-files'); // retorna ARRAY
      renderGrid(feedEl, Array.isArray(arr) ? arr : (arr.items || []));
    }
  })();

  // Descobrir: agrupar por "profile" a partir do ARRAY (sem tocar na API)
  (async () => {
    const grid = el('#discoverGrid');
    if (!grid) return;
    const arr = await safeFetch('/api/get-files');
    const byProfile = {};
    (Array.isArray(arr)?arr:[]).forEach(it => {
      const p = it.profile || 'unknown';
      (byProfile[p] ||= []).push(it);
    });
    // Seleção de avatar: pega a imagem mais antiga; se empatar, determinística por path
    const profiles = Object.entries(byProfile).map(([id, items]) => {
      const images = items.filter(i => (i.type||'')==='image');
      let avatar_url = '';
      if (images.length){
        images.sort((a,b)=> new Date(a.date||0) - new Date(b.date||0) || a.path.localeCompare(b.path));
        avatar_url = images[0].url;
      }
      return { id, avatar_url, items };
    });
    renderGrid(grid, profiles.flatMap(p => p.items.slice(0,6)));
  })();

})();