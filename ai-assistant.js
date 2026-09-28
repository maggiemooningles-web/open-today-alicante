/* Open Today Alicante — on-site AI concierge.
 * Key-free on GitHub Pages: natural-language search over the live local directory.
 * Optional remote LLM hook: set window.OTA_AI_ENDPOINT to a trusted backend.
 */
(function () {
  'use strict';

  var state = { open: false, busy: false, lastIntent: null };

  var css = [
    '#otaAiAssistant{position:fixed;right:18px;bottom:18px;z-index:1200;font-family:Inter,system-ui,sans-serif}',
    '#otaAiLauncher{display:flex;align-items:center;gap:.55rem;border:1px solid #047857;background:linear-gradient(135deg,#047857,#059669);color:#fff;border-radius:999px;padding:.78rem 1rem;box-shadow:0 16px 36px rgba(4,120,87,.28);font-size:.78rem;font-weight:950;cursor:pointer}',
    '#otaAiLauncher:hover{transform:translateY(-2px)}',
    '#otaAiLauncher .ota-ai-star{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.17)}',
    '#otaAiPanel{display:none;position:absolute;right:0;bottom:58px;width:min(420px,calc(100vw - 24px));height:min(680px,calc(100vh - 100px));background:#fff;border:1px solid #dbe5df;border-radius:1.35rem;box-shadow:0 28px 80px rgba(15,23,42,.25);overflow:hidden}',
    '#otaAiPanel.is-open{display:flex;flex-direction:column}',
    '.ota-ai-head{display:flex;align-items:center;justify-content:space-between;padding:1rem;background:linear-gradient(135deg,#f0fdf4,#ecfeff);border-bottom:1px solid #dbe5df}',
    '.ota-ai-brand{display:flex;align-items:center;gap:.7rem}.ota-ai-avatar{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;color:#047857;background:#fff;border:1px solid #ccebd7}',
    '.ota-ai-title{font-size:.9rem;font-weight:950;color:#0f172a}.ota-ai-subtitle{font-size:.66rem;font-weight:700;color:#64748b;margin-top:.12rem}',
    '.ota-ai-close{border:0;background:transparent;color:#64748b;width:34px;height:34px;border-radius:10px;cursor:pointer}',
    '.ota-ai-quick{display:flex;gap:.4rem;overflow:auto;padding:.65rem .8rem;border-bottom:1px solid #eef2f3}',
    '.ota-ai-chip{white-space:nowrap;border:1px solid #e2e8f0;background:#f8fafc;color:#334155;border-radius:999px;padding:.46rem .65rem;font-size:.66rem;font-weight:900;cursor:pointer}',
    '.ota-ai-messages{flex:1;overflow:auto;padding:1rem;background:#f8fafc}',
    '.ota-ai-msg{max-width:92%;margin-bottom:.75rem}.ota-ai-msg.user{margin-left:auto}',
    '.ota-ai-bubble{padding:.75rem .82rem;border-radius:1rem;border:1px solid #e2e8f0;background:#fff;color:#334155;font-size:.76rem;line-height:1.48;box-shadow:0 5px 16px rgba(15,23,42,.035)}',
    '.ota-ai-msg.user .ota-ai-bubble{background:#047857;color:#fff;border-color:#047857}',
    '.ota-ai-note{font-size:.61rem;font-weight:700;color:#94a3b8;margin-top:.28rem}',
    '.ota-ai-results{display:grid;gap:.55rem;margin-top:.55rem}.ota-ai-result{padding:.65rem;border:1px solid #e2e8f0;border-radius:.95rem;background:#fff}',
    '.ota-ai-result-top{display:flex;gap:.65rem;align-items:flex-start}.ota-ai-result-logo{width:42px;height:42px;flex:0 0 42px}',
    '.ota-ai-result-logo .store-v12-logo{width:42px!important;height:42px!important}.ota-ai-result-name{font-size:.75rem;font-weight:950;color:#0f172a;line-height:1.2}',
    '.ota-ai-result-meta{font-size:.63rem;color:#64748b;margin-top:.18rem}',
    '.ota-ai-result-status{display:inline-flex;margin-top:.32rem;padding:.26rem .45rem;border-radius:999px;border:1px solid #a7f3d0;background:#ecfdf5;color:#047857;font-size:.59rem;font-weight:950}',
    '.ota-ai-result-status.closed{background:#fff1f2;border-color:#fecdd3;color:#be123c}.ota-ai-result-status.unknown{background:#fffbeb;border-color:#fde68a;color:#a16207}',
    '.ota-ai-result-actions{display:flex;gap:.4rem;margin-top:.55rem}.ota-ai-result-actions a,.ota-ai-result-actions button{flex:1;text-align:center;text-decoration:none;border-radius:.7rem;padding:.44rem .55rem;font-size:.62rem;font-weight:900;cursor:pointer}',
    '.ota-ai-primary{border:1px solid #047857;background:#047857;color:#fff}.ota-ai-secondary{border:1px solid #e2e8f0;background:#f8fafc;color:#334155}',
    '.ota-ai-locate,.ota-ai-action{margin-top:.55rem;border-radius:.7rem;padding:.48rem .6rem;font-size:.62rem;font-weight:900;cursor:pointer}.ota-ai-locate{width:100%;border:1px solid #047857;background:#047857;color:#fff}.ota-ai-action{border:1px solid #dbe5df;background:#f8fafc;color:#334155}',
    '.ota-ai-inputbar{display:flex;gap:.45rem;padding:.7rem;border-top:1px solid #e2e8f0;background:#fff}',
    '#otaAiInput{flex:1;min-width:0;border:1px solid #cbd5e1;border-radius:.85rem;padding:.7rem .75rem;outline:none;font-size:.74rem;color:#0f172a;background:#fff}',
    '#otaAiSend{width:44px;border:0;border-radius:.85rem;background:#047857;color:#fff;cursor:pointer}.ota-ai-foot{padding:.45rem .75rem .6rem;text-align:center;background:#fff;color:#94a3b8;font-size:.56rem;font-weight:700}',
    '@media(max-width:640px){#otaAiAssistant{right:10px;bottom:10px}#otaAiPanel{right:-4px;width:calc(100vw - 20px);height:min(720px,calc(100vh - 78px))}.ota-ai-label{display:none}}'
  ].join('');

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function norm(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
  }
  function isEN() { return typeof currentLang !== 'undefined' && currentLang === 'en'; }
  function L(es,en) { return isEN() ? en : es; }

  function addStyles() {
    if (document.getElementById('otaAiStyles')) return;
    var style = document.createElement('style');
    style.id = 'otaAiStyles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function build() {
    if (document.getElementById('otaAiAssistant')) return;
    var root = document.createElement('div');
    root.id = 'otaAiAssistant';
    root.innerHTML =
      '<div id="otaAiPanel" role="dialog" aria-modal="false">' +
        '<div class="ota-ai-head">' +
          '<div class="ota-ai-brand"><div class="ota-ai-avatar"><i class="fa-solid fa-wand-magic-sparkles"></i></div><div>' +
            '<div class="ota-ai-title">' + esc(L('Asistente de Open Today','Open Today assistant')) + '</div>' +
            '<div class="ota-ai-subtitle">' + esc(L('Dime qué necesitas y lo busco.','Tell me what you need and I’ll search.')) + '</div>' +
          '</div></div>' +
          '<button id="otaAiClose" class="ota-ai-close" aria-label="' + esc(L('Cerrar','Close')) + '"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="ota-ai-quick">' +
          '<button class="ota-ai-chip" data-ai-prompt="' + esc(L('¿Qué está abierto cerca de mí ahora?','What is open near me now?')) + '">📍 ' + esc(L('Cerca de mí','Near me')) + '</button>' +
          '<button class="ota-ai-chip" data-ai-prompt="' + esc(L('Supermercado abierto en El Campello','Open supermarket in El Campello')) + '">🛒 ' + esc(L('Supermercado','Supermarket')) + '</button>' +
          '<button class="ota-ai-chip" data-ai-prompt="' + esc(L('Farmacia abierta ahora','Pharmacy open now')) + '">💊 ' + esc(L('Farmacia','Pharmacy')) + '</button>' +
          '<button class="ota-ai-chip" data-ai-prompt="' + esc(L('Estanco abierto hoy','Tobacco shop open today')) + '">🚬 ' + esc(L('Estanco','Tobacco shop')) + '</button>' +
        '</div>' +
        '<div id="otaAiMessages" class="ota-ai-messages"></div>' +
        '<div class="ota-ai-inputbar"><input id="otaAiInput" type="text" autocomplete="off" placeholder="' +
          esc(L('Ej.: supermercado abierto en Campello cerca de mí','e.g. open supermarket in El Campello near me')) +
          '"><button id="otaAiSend" aria-label="' + esc(L('Enviar','Send')) + '"><i class="fa-solid fa-arrow-up"></i></button></div>' +
        '<div class="ota-ai-foot">' + esc(L('“Abierto ahora” solo usa horarios confirmados.','“Open now” only uses confirmed hours.')) + '</div>' +
      '</div>' +
      '<button id="otaAiLauncher" type="button" aria-expanded="false"><span class="ota-ai-star">✨</span><span class="ota-ai-label">' +
        esc(L('Pregúntame','Ask me')) + '</span><i class="fa-solid fa-message"></i></button>';
    document.body.appendChild(root);
  }

  function openPanel() {
    state.open = true;
    var panel = document.getElementById('otaAiPanel');
    if (panel) panel.classList.add('is-open');
    var launcher = document.getElementById('otaAiLauncher');
    if (launcher) launcher.setAttribute('aria-expanded','true');
    var box = document.getElementById('otaAiMessages');
    if (box && !box.children.length) {
      addMessage('assistant',
        esc(L('Hola 👋 Puedo buscar por municipio, categoría, cadena, “abierto ahora” y cercanía.','Hi 👋 I can search by town, category, chain, “open now” and distance.')) +
        '<div><button class="ota-ai-locate" data-ai-locate="1">📍 ' + esc(L('Usar mi ubicación','Use my location')) + '</button></div>');
    }
    setTimeout(function(){ var input=document.getElementById('otaAiInput'); if(input) input.focus(); },30);
  }
  function closePanel() {
    state.open = false;
    var panel=document.getElementById('otaAiPanel'); if(panel) panel.classList.remove('is-open');
    var launcher=document.getElementById('otaAiLauncher'); if(launcher) launcher.setAttribute('aria-expanded','false');
  }
  function addMessage(kind, html, note) {
    var box=document.getElementById('otaAiMessages'); if(!box) return;
    var wrap=document.createElement('div');
    wrap.className='ota-ai-msg '+kind;
    wrap.innerHTML='<div class="ota-ai-bubble">'+html+'</div>'+(note?'<div class="ota-ai-note">'+esc(note)+'</div>':'');
    box.appendChild(wrap);
    box.scrollTop=box.scrollHeight;
  }

  function detectCategory(text) {
    var rules = [
      ['supermarket', /\bsupermercad|\bsuper\b|\bgrocery\b|\bmarket\b|\balimentacion\b|\balimentación\b/],
      ['pharmacy', /\bfarmacia\b|\bpharmacy\b|\bchemist\b|\bmedicina\b|\bmedicinas\b/],
      ['petrol', /\bgasolinera\b|\bpetrol\b|\bfuel\b|\bcombustible\b|\bgasoil\b/],
      ['bakery', /\bpanaderia\b|\bpanadería\b|\bforn\b|\bbakery\b|\bdesayuno\b|\bcroissant\b/],
      ['hardware', /\bbricolaje\b|\bferreteria\b|\bferretería\b|\bhardware\b|\bherramientas\b/],
      ['garden', /\bjardineria\b|\bjardinería\b|\bvivero\b|\bgarden\b|\bplantas\b/],
      ['electronics', /\belectronica\b|\belectrónica\b|\binformatica\b|\binformática\b|\btelefonia\b|\btelefonía\b|\belectronics\b/],
      ['vet', /\bveterinario\b|\bveterinaria\b|\bvet\b|\bmascota\b|\bmascotas\b/],
      ['tobacco', /\bestanco\b|\bestancos\b|\btabaco\b|\btobacco\b|\bcigarrillo/],
      ['mall', /\bcentro comercial\b|\bshopping center\b|\bmall\b/],
      ['express', /\bexpress\b|\bconveniencia\b|\bconvenience\b/]
    ];
    for (var i=0;i<rules.length;i++) if (rules[i][1].test(text)) return rules[i][0];
    return null;
  }

  function detectTown(text) {
    try {
      var entries = typeof getTownEntries === 'function' ? getTownEntries() : [];
      for (var i=0;i<entries.length;i++) {
        var item=entries[i], names=[item.es,item.en,item.slug].concat(item.aliases||[]);
        for (var j=0;j<names.length;j++) {
          if (names[j] && text.indexOf(norm(names[j])) >= 0) return item;
        }
      }
    } catch (_) {}
    return null;
  }

  function detectBrand(text) {
    var preferred=['Mercadona','Lidl','ALDI','Consum','Charter','Carrefour','Carrefour Express','Repsol','Cepsa','bp','Moeve','Leroy Merlin','MediaMarkt','Supercor','DIA','Unide','Udaco','Hiperber','Dialprix','masymas'];
    for (var i=0;i<preferred.length;i++) if (text.indexOf(norm(preferred[i]))>=0) return preferred[i];
    try {
      if (typeof STORES_DATA !== 'undefined') {
        for (var k=0;k<STORES_DATA.length;k++) if (STORES_DATA[k].chain && text.indexOf(norm(STORES_DATA[k].chain))>=0) return STORES_DATA[k].chain;
      }
    } catch (_) {}
    return null;
  }

  function analyze(query) {
    var text=norm(query);
    var radiusMatch=text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:km|kilometros|kilómetros)\b/);
    return {
      query:query, text:text, category:detectCategory(text), town:detectTown(text), brand:detectBrand(text),
      nearMe:/\b(cerca de mi|cerca de mí|near me|closest|nearest|lo mas cercano|lo más cercano)\b/.test(text),
      openNow:/\b(abierto|abierta|abiertos|abiertas|open|ahora|now|hoy|today|puedo comprar|necesito)\b/.test(text),
      sunday:/\b(domingo|domingos|sunday)\b/.test(text),
      twentyFour:/\b24\s*h\b|\b24h\b|\b24\s*horas\b|\b24\/7\b/.test(text),
      radiusKm:radiusMatch ? Number(radiusMatch[1].replace(',','.')) : null
    };
  }

  function statusFor(store) {
    try {
      if (typeof getStoreStatus === 'function') return getStoreStatus(store, typeof getRouteStatusDate === 'function' ? getRouteStatusDate() : new Date());
    } catch (_) {}
    return {isOpen:false,isConfirmed:false,badgeText:{es:'Horario no confirmado',en:'Hours unconfirmed'},detailText:{es:'Horario no confirmado',en:'Hours unconfirmed'}};
  }

  function matches(store,intent) {
    if (intent.category && store.category!==intent.category) return false;
    if (intent.town && typeof storeMatchesTown==='function' && !storeMatchesTown(store,intent.town.slug)) return false;
    if (intent.brand && norm(store.chain).indexOf(norm(intent.brand))<0 && norm(intent.brand).indexOf(norm(store.chain))<0) return false;
    if (intent.nearMe && !(userGeo && Number.isFinite(userGeo.lat) && Number.isFinite(userGeo.lng))) return false;
    var st=statusFor(store);
    if (intent.openNow && (!st.isConfirmed || !st.isOpen)) return false;
    if (intent.sunday && !store.isSundayOpen) return false;
    if (intent.twentyFour) {
      var op=Number(store.weekOpenHour), cl=Number(store.weekCloseHour);
      if (!(op===0 && cl>=24) && store.is24h!==true) return false;
    }
    if (!intent.category && !intent.town && !intent.brand) {
      var hay=norm([store.name,store.chain,store.address,store.town,store.district,store.suburb,store.neighbourhood].filter(Boolean).join(' '));
      var stop=/^(abierto|abierta|ahora|open|now|today|hoy|cerca|de|mi|me|near|en|el|la|un|una|por|favor)$/;
      var words=intent.text.split(' ').filter(function(w){return w.length>2 && !stop.test(w);});
      if (words.length && !words.some(function(w){return hay.indexOf(w)>=0;})) return false;
    }
    return true;
  }

  function rowsFor(intent) {
    var out=[];
    if (typeof STORES_DATA==='undefined') return out;
    for (var i=0;i<STORES_DATA.length;i++) {
      var store=STORES_DATA[i]; if (!matches(store,intent)) continue;
      var dist;
      if (intent.nearMe && Number.isFinite(store.lat) && Number.isFinite(store.lng)) {
        dist = typeof calculateDistance==='function' ? calculateDistance(userGeo.lat,userGeo.lng,store.lat,store.lng) : undefined;
      }
      if (intent.radiusKm!=null && Number.isFinite(dist) && dist>intent.radiusKm) continue;
      out.push({store:store,status:statusFor(store),distance:dist});
    }
    out.sort(function(a,b){
      if(intent.nearMe){var ad=Number.isFinite(a.distance)?a.distance:Infinity,bd=Number.isFinite(b.distance)?b.distance:Infinity;if(ad!==bd)return ad-bd;}
      if(a.status.isOpen!==b.status.isOpen)return a.status.isOpen?-1:1;
      if(a.store.isSundayOpen!==b.store.isSundayOpen)return a.store.isSundayOpen?-1:1;
      return String(a.store.name).localeCompare(String(b.store.name));
    });
    return out;
  }

  function distanceText(km) { return !Number.isFinite(km) ? '' : (km<1 ? Math.round(km*1000)+' m' : km.toFixed(1)+' km'); }

  function resultCard(row) {
    var s=row.store, st=row.status, open=st.isConfirmed&&st.isOpen, unknown=!st.isConfirmed;
    var badge=open ? '✅ '+L('ABIERTO AHORA','OPEN NOW') : (unknown ? '• '+(st.badgeText[isEN()?'en':'es']) : '• '+(st.badgeText[isEN()?'en':'es']));
    var cls=open?'':(unknown?' unknown':' closed');
    var logo=typeof chainLogoMarkup==='function' ? chainLogoMarkup(s) : '<div style="width:42px;height:42px;border-radius:10px;background:#f8fafc;display:grid;place-items:center"><i class="fa-solid fa-store"></i></div>';
    var meta=[row.distance!=null?distanceText(row.distance):'',s.town,s.chain||s.category].filter(Boolean).join(' · ');
    var detail=st.isConfirmed ? (st.detailText[isEN()?'en':'es']||'') : L('Horario aún no confirmado.','Opening hours are not confirmed yet.');
    var directions='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.name+', '+(s.address||s.town||'Alicante'));
    return '<div class="ota-ai-result"><div class="ota-ai-result-top"><div class="ota-ai-result-logo">'+logo+'</div><div style="min-width:0;flex:1">' +
      '<div class="ota-ai-result-name">'+esc(s.name)+'</div><div class="ota-ai-result-meta">'+esc(meta)+'</div>' +
      '<div class="ota-ai-result-status'+cls+'">'+esc(badge)+'</div><div class="ota-ai-result-meta">'+esc(detail)+'</div></div></div>' +
      '<div class="ota-ai-result-actions"><a class="ota-ai-primary" href="'+esc(directions)+'" target="_blank" rel="noopener">'+esc(L('Cómo llegar','Directions'))+'</a>' +
      '<button class="ota-ai-secondary" data-ai-store="'+esc(s.slug)+'">'+esc(L('Ver ficha','View'))+'</button></div></div>';
  }

  function summary(intent) {
    var bits=[];
    try { if(intent.category && typeof categoryLabel==='function') bits.push(categoryLabel(intent.category)); } catch (_) {}
    if(intent.brand) bits.push(intent.brand);
    if(intent.town) bits.push(isEN()?(intent.town.en||intent.town.es):(intent.town.es||intent.town.en));
    if(intent.openNow) bits.push(L('abierto ahora','open now'));
    if(intent.nearMe) bits.push(L('cerca de ti','near you'));
    return bits.join(' · ');
  }

  function applyIntent(intent) {
    try {
      selectedCategory=intent.category||'all';
      selectedTown=intent.town?intent.town.slug:'all';
      openNowOnly=!!intent.openNow;
      sundayOnlyFilter=!!intent.sunday;
      sortBy=intent.nearMe?'distance':'openFirst';
      visibleResultLimit=typeof RESULTS_PAGE_SIZE!=='undefined'?RESULTS_PAGE_SIZE:60;
      var cat=document.getElementById('categorySelect');if(cat)cat.value=selectedCategory;
      var town=document.getElementById('townSelect');if(town)town.value=selectedTown;
      var sun=document.getElementById('sundayOnlyToggle');if(sun)sun.checked=sundayOnlyFilter;
      var sort=document.getElementById('sortSelect');if(sort)sort.value=sortBy;
      if(typeof updateOpenNowToggle==='function')updateOpenNowToggle();
      if(typeof renderStoresList==='function')renderStoresList();
      closePanel();
      var result=document.getElementById('resultsToolbar');if(result)result.scrollIntoView({behavior:'smooth',block:'start'});
    } catch (_) {}
  }

  function askRemote(query,intent) {
    var endpoint=window.OTA_AI_ENDPOINT;
    if(!endpoint) return Promise.resolve(null);
    try {
      return fetch(endpoint,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({query:query,language:isEN()?'en':'es',intent:intent,userGeo:(typeof userGeo!=='undefined'?userGeo:null)}),
        signal:AbortSignal.timeout(10000)
      }).then(function(r){return r.ok?r.json():null;}).then(function(p){return p&&p.answer?String(p.answer):null;}).catch(function(){return null;});
    } catch (_) { return Promise.resolve(null); }
  }

  function ask(query) {
    query=String(query||'').trim();
    if(!query||state.busy)return;
    state.busy=true;
    var input=document.getElementById('otaAiInput');if(input)input.value='';
    addMessage('user',esc(query));
    var intent=analyze(query);state.lastIntent=intent;

    if(intent.nearMe && !(typeof userGeo!=='undefined' && userGeo && Number.isFinite(userGeo.lat) && Number.isFinite(userGeo.lng))) {
      addMessage('assistant',esc(L('Puedo buscarlo cerca de ti, pero necesito tu ubicación.','I can search near you, but I need your location.')) +
        '<button class="ota-ai-locate" data-ai-locate="1">📍 '+esc(L('Usar mi ubicación','Use my location'))+'</button>');
      state.busy=false;return;
    }

    askRemote(query,intent).then(function(remote){
      if(remote){addMessage('assistant',esc(remote).replace(/\n/g,'<br>'));state.busy=false;return;}
      var rows=rowsFor(intent);
      if(!rows.length&&intent.openNow){
        var relaxed=Object.assign({},intent,{openNow:false}), all=rowsFor(relaxed);
        if(all.length){
          addMessage('assistant',esc(L('No encuentro un horario confirmado como abierto ahora. Sí encuentro '+all.length+' coincidencias, pero algunas pueden tener el horario sin confirmar.','I cannot find a confirmed place open now. I did find '+all.length+' matches, but some may have unconfirmed hours.')));
          rows=all;
        }
      }
      if(!rows.length){
        addMessage('assistant',esc(L('No he encontrado una coincidencia con esos criterios. Prueba con otro municipio, categoría o marca.','I could not find a match with those criteria. Try another town, category or brand.'))+
          '<br><button class="ota-ai-action" data-ai-open-main="1">'+esc(L('Abrir el buscador completo','Open the full search'))+'</button>');
        state.busy=false;return;
      }
      var shown=rows.slice(0,5), msg=esc(L('He encontrado '+rows.length+' opción'+(rows.length===1?'':'es'),'I found '+rows.length+' option'+(rows.length===1?'':'s')));
      if(summary(intent))msg+='<div style="margin-top:.2rem;color:#64748b;font-size:.66rem">'+esc(summary(intent))+'</div>';
      msg+='<div class="ota-ai-results">'+shown.map(resultCard).join('')+'</div>';
      msg+='<button class="ota-ai-action" data-ai-apply="1">✨ '+esc(L('Ver estos resultados en la web','Show these results on the site'))+'</button>';
      addMessage('assistant',msg,L('La respuesta usa el directorio actual; “abierto ahora” requiere horario confirmado.','Uses the current directory; “open now” requires confirmed hours.'));
      state.busy=false;
    });
  }

  function bind() {
    document.getElementById('otaAiLauncher').addEventListener('click',function(){state.open?closePanel():openPanel();});
    document.getElementById('otaAiClose').addEventListener('click',closePanel);
    document.getElementById('otaAiSend').addEventListener('click',function(){ask(document.getElementById('otaAiInput').value);});
    document.getElementById('otaAiInput').addEventListener('keydown',function(e){if(e.key==='Enter')ask(e.target.value);});
    document.querySelectorAll('[data-ai-prompt]').forEach(function(b){b.addEventListener('click',function(){ask(b.getAttribute('data-ai-prompt')||'');});});
    document.getElementById('otaAiMessages').addEventListener('click',function(e){
      var prompt=e.target.closest('[data-ai-prompt]');if(prompt){ask(prompt.getAttribute('data-ai-prompt')||'');return;}
      var locate=e.target.closest('[data-ai-locate]');if(locate&&typeof requestGpsLocation==='function'){requestGpsLocation(function(){addMessage('assistant',esc(L('Perfecto. Ya tengo tu ubicación. ¿Qué necesitas?','Perfect. I have your location. What do you need?')));});return;}
      var store=e.target.closest('[data-ai-store]');if(store&&typeof openStoreFromCard==='function'){closePanel();openStoreFromCard(store.getAttribute('data-ai-store'));return;}
      var apply=e.target.closest('[data-ai-apply]');if(apply){applyIntent(state.lastIntent||{});return;}
      var main=e.target.closest('[data-ai-open-main]');if(main){closePanel();var h=document.getElementById('heroSearchInput');if(h)h.focus();}
    });
  }

  function init() {
    addStyles();build();bind();
    document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPanel();}if(e.key==='Escape'&&state.open)closePanel();});
    window.OpenTodayAI={ask:ask,open:openPanel,close:closePanel,analyze:analyze};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();