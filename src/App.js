import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';

const TRAVAUX_M2 = 1200;

const MONTMARTRE_POLYGON = [
  [48.89006616583566, 2.3399816318652427],
  [48.88968475443497, 2.334657271277621],
  [48.88672871742938, 2.3332070563311333],
  [48.88456266233064, 2.3321090364430574],
  [48.88265536633,    2.338386395424777],
  [48.88243738501271, 2.3396915888756666],
  [48.883908740467774,2.346901228893387],
  [48.88683769885438, 2.347357010733475],
  [48.88930334012477, 2.346196838776649],
  [48.89039308757785, 2.3420948022153993],
  [48.88995719144694, 2.3385935689883013],
  [48.8897119982031,  2.334553684495063],
  [48.89006616583566, 2.3399816318652427],
];

function calcMarge(surface, prixAchat, params) {
  const t = params ? params.travaux : TRAVAUX_M2;
  const travaux = surface * t;
  const notaire = prixAchat * 0.08;
  const revente = surface * 13500;
  const cout    = prixAchat + travaux + notaire;
  const marge   = revente - cout;
  const pct     = (marge / cout) * 100;
  return { marge: Math.round(marge), pct: Math.round(pct*10)/10, revente: Math.round(revente) };
}

function fmt(n) { return Math.round(n).toLocaleString('fr-FR') + ' €'; }

const DPE_COLORS = { A:'#00a651', B:'#50b848', C:'#b5d334', D:'#f0e000', E:'#f7941d', F:'#ed1c24', G:'#9e1a1a' };
const rankBg     = ['#FAEEDA','#F1EFE8','#FAECE7','#E6F1FB','#EAF3DE'];
const rankText   = ['#633806','#444441','#4A1B0C','#042C53','#173404'];

function isVenduLoue(titre) {
  if (!titre) return false;
  const t = titre.toLowerCase();
  return t.includes('loué') || t.includes('louée') || t.includes('loue') ||
         t.includes('occupé') || t.includes('occupe') || t.includes('bail') ||
         t.includes('locataire') || t.includes('investisseur') || t.includes('invest');
}

function ZoneMap() {
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);

  useEffect(() => {
    const iframe = containerRef.current;
    if (!iframe) return;
    iframe.src = 'https://www.openstreetmap.org/export/embed.html'
      + '?bbox=2.3310%2C48.8815%2C2.3485%2C48.8915'
      + '&layer=mapnik';
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth || 268;
    const H = 220;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const minLon = 2.3310, maxLon = 2.3485;
    const minLat = 48.8815, maxLat = 48.8915;
    function toXY(lat, lon) {
      return [((lon-minLon)/(maxLon-minLon))*W, H-((lat-minLat)/(maxLat-minLat))*H];
    }
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    MONTMARTRE_POLYGON.forEach(([lat, lon], i) => {
      const [x, y] = toXY(lat, lon);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle   = 'rgba(34,197,94,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(22,163,74,0.9)';
    ctx.lineWidth   = 2.5;
    ctx.stroke();
  }, []);

  return (
    <div style={{ position:'relative', borderRadius:10, overflow:'hidden', border:'0.5px solid #e5e5e5', height:220 }}>
      <iframe ref={containerRef} title="Zone Montmartre" width="100%" height="220"
        style={{ display:'block', border:'none', position:'absolute', top:0, left:0 }} allowFullScreen />
      <canvas ref={canvasRef}
        style={{ position:'absolute', top:0, left:0, width:'100%', height:220, pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:8, left:8, background:'rgba(22,163,74,0.92)', color:'#fff',
        fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:6, pointerEvents:'none' }}>
        Zone 1 — Montmartre 18e
      </div>
    </div>
  );
}

export default function App() {
  const [annonces, setAnnonces]     = useState([]);
  const [stats, setStats]           = useState({ total:0, nouvelles:0, marge_moy:0, nb_likes:0 });
  const [loading, setLoading]       = useState(true);
  const [filtre, setFiltre]         = useState('all');
  const [openId, setOpenId]         = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [deleting, setDeleting]     = useState(null);
  const [liking, setLiking]         = useState(null);
  const [likedIds, setLikedIds]     = useState(new Set());
  const [params, setParams]         = useState({ travaux:1200, surfMin:9, surfMax:45 });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('annonces').select('*')
        .eq('zone','montmartre').eq('actif',true)
        .gte('surface', params.surfMin)
        .lte('surface', params.surfMax)
        .order('score', { ascending:false }).limit(50);
      if (filtre === 'dpe')    query = query.in('dpe', ['F','G']);
      if (filtre === 'drop')   query = query.gt('nb_baisses', 0);
      if (filtre === 'new')    query = query.lte('jours_en_ligne', 3);
      if (filtre === 'margin') query = query.gte('marge_pct', 10);
      if (filtre === 'loue')   query = query.ilike('titre', '%lou%');
      if (filtre === 'liked') {
        const ids = [...likedIds];
        if (ids.length === 0) { setAnnonces([]); setLoading(false); return; }
        query = supabase.from('annonces').select('*').in('id', ids).eq('actif',true);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAnnonces(data || []);
      setLastUpdate(new Date());

      const { count } = await supabase.from('annonces').select('*', { count:'exact', head:true })
        .eq('zone','montmartre').eq('actif',true);
      const { count: nouvelles } = await supabase.from('annonces').select('*', { count:'exact', head:true })
        .eq('zone','montmartre').eq('actif',true).lte('jours_en_ligne',1);
      const { count: nb_likes } = await supabase.from('feedbacks').select('*', { count:'exact', head:true })
        .eq('signal','like');

      const rows   = data || [];
      const marges = rows.map(a => calcMarge(a.surface, a.prix, params).pct).filter(p => p > 0);
      const moy    = marges.length ? Math.round(marges.reduce((a,b)=>a+b,0)/marges.length*10)/10 : 0;
      setStats({ total:count||0, nouvelles:nouvelles||0, marge_moy:moy, nb_likes:nb_likes||0 });

      // Charger les likes existants
      const { data: feedbacks } = await supabase.from('feedbacks')
        .select('annonce_id').eq('signal','like');
      if (feedbacks) setLikedIds(new Set(feedbacks.map(f => f.annonce_id)));

    } catch (err) { console.error(err); }
    setLoading(false);
  }, [filtre, params, likedIds.size]);

  useEffect(() => { loadData(); }, [filtre, params]);

  async function supprimerAnnonce(e, annonce) {
    e.stopPropagation();
    if (!window.confirm('Supprimer cette annonce du dashboard ?')) return;
    setDeleting(annonce.id);
    try {
      await supabase.from('annonces').update({ actif:false }).eq('id', annonce.id);
      // Enregistrer le dislike pour le ML
      await supabase.from('feedbacks').insert({
        annonce_id:    annonce.id,
        signal:        'dislike',
        surface:       annonce.surface,
        prix_m2:       annonce.prix_m2,
        dpe:           annonce.dpe || '',
        marge_pct:     annonce.marge_pct,
        jours_en_ligne: annonce.jours_en_ligne || 0,
        nb_baisses:    annonce.nb_baisses || 0,
      });
      setAnnonces(prev => prev.filter(a => a.id !== annonce.id));
    } catch (err) { console.error(err); }
    setDeleting(null);
  }

  async function likerAnnonce(e, annonce) {
    e.stopPropagation();
    setLiking(annonce.id);
    try {
      const isLiked = likedIds.has(annonce.id);
      if (isLiked) {
        // Retirer le like
        await supabase.from('feedbacks')
          .delete().eq('annonce_id', annonce.id).eq('signal','like');
        setLikedIds(prev => { const s = new Set(prev); s.delete(annonce.id); return s; });
      } else {
        // Ajouter le like
        await supabase.from('feedbacks').insert({
          annonce_id:    annonce.id,
          signal:        'like',
          surface:       annonce.surface,
          prix_m2:       annonce.prix_m2,
          dpe:           annonce.dpe || '',
          marge_pct:     annonce.marge_pct,
          jours_en_ligne: annonce.jours_en_ligne || 0,
          nb_baisses:    annonce.nb_baisses || 0,
        });
        setLikedIds(prev => new Set([...prev, annonce.id]));
      }
    } catch (err) { console.error(err); }
    setLiking(null);
  }

  return (
    <div style={{ fontFamily:'system-ui,sans-serif', maxWidth:1100, margin:'0 auto', padding:'24px 16px', background:'#fafafa', minHeight:'100vh' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div style={{ fontSize:20, fontWeight:600, letterSpacing:-0.5 }}>
          paris<span style={{ color:'#185FA5' }}>invest</span>.ai
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#EAF3DE', color:'#27500A', fontSize:12, padding:'4px 10px', borderRadius:20 }}>
            <span style={{ width:7, height:7, background:'#27500A', borderRadius:'50%', display:'inline-block' }} />
            Données en direct
          </span>
          {lastUpdate && <span style={{ fontSize:12, color:'#888' }}>Mis à jour {lastUpdate.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>}
          <button onClick={loadData} style={{ fontSize:12, padding:'5px 12px', borderRadius:8, border:'0.5px solid #ddd', background:'#fff', cursor:'pointer' }}>Actualiser</button>
        </div>
      </div>

      {/* Métriques */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Annonces analysées',  val:stats.total.toLocaleString('fr-FR'), sub:`+${stats.nouvelles} aujourd'hui` },
          { label:'Marge nette moyenne', val:stats.marge_moy+'%',                  sub:'Top 50 annonces' },
          { label:'Profil ML',           val:`${stats.nb_likes} ❤️`,              sub: stats.nb_likes >= 3 ? 'ML actif ✓' : `Encore ${3-stats.nb_likes} likes pour activer` },
          { label:'Zone active',         val:'Montmartre',                          sub:'75018 Paris' },
        ].map((m,i) => (
          <div key={i} style={{ background:'#f0f0f0', borderRadius:8, padding:'14px 16px' }}>
            <div style={{ fontSize:12, color:'#666', marginBottom:6 }}>{m.label}</div>
            <div style={{ fontSize:20, fontWeight:600, color:'#111' }}>{m.val}</div>
            <div style={{ fontSize:11, color: i===2 && stats.nb_likes>=3 ? '#27500A' : '#999', marginTop:3 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16 }}>

        {/* Liste annonces */}
        <div style={{ background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:12, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px 0', flexWrap:'wrap', gap:8, marginBottom:10 }}>
            <span style={{ fontSize:14, fontWeight:500 }}>Top annonces — Montmartre 18e</span>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[['all','Tous'],['dpe','DPE F/G'],['drop','Baisses'],['new','Nouvelles'],['margin','Marge >10%'],['loue','Vendu loué'],['liked','❤️ Mes likes']].map(([k,l]) => (
                <button key={k} onClick={()=>setFiltre(k)} style={{
                  fontSize:12, padding:'4px 10px', borderRadius:20, cursor:'pointer',
                  background: filtre===k ? '#185FA5' : 'transparent',
                  color:      filtre===k ? '#fff'    : '#666',
                  border:`0.5px solid ${filtre===k ? '#185FA5' : '#ddd'}`
                }}>{l}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:14 }}>Chargement...</div>
          ) : annonces.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:14 }}>Aucune annonce pour ce filtre</div>
          ) : annonces.map((a, i) => {
            const isOpen    = openId === a.id;
            const m         = calcMarge(a.surface, a.prix, params);
            const mColor    = m.pct >= 15 ? '#27500A' : m.pct >= 8 ? '#854F0B' : '#A32D2D';
            const venduLoue = isVenduLoue(a.titre);
            const isLiked   = likedIds.has(a.id);

            return (
              <div key={a.id} style={{ opacity: deleting===a.id ? 0.4 : 1, transition:'opacity .2s' }}>
                <div
                  onClick={() => setOpenId(isOpen ? null : a.id)}
                  style={{ display:'flex', gap:12, padding:'12px 16px', borderBottom:'0.5px solid #f0f0f0', cursor:'pointer', alignItems:'flex-start', background: isLiked ? '#fff8f0' : venduLoue ? '#fdf8ff' : '#fff' }}
                  onMouseEnter={e => e.currentTarget.style.background = isLiked ? '#fff3e6' : venduLoue ? '#f5eeff' : '#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background = isLiked ? '#fff8f0' : venduLoue ? '#fdf8ff' : '#fff'}
                >
                  <div style={{ width:28, height:28, borderRadius:'50%', background:rankBg[Math.min(i,4)], color:rankText[Math.min(i,4)], display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:500, flexShrink:0, marginTop:2 }}>
                    #{i+1}
                  </div>

                  {a.photo ? (
                    <img src={a.photo} alt="" style={{ width:80, height:60, objectFit:'cover', borderRadius:6, flexShrink:0 }} onError={e=>e.target.style.display='none'} />
                  ) : (
                    <div style={{ width:80, height:60, borderRadius:6, background:'#f0f0f0', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#ccc' }}>🏠</div>
                  )}

                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.titre}</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:5 }}>
                      {a.dpe && <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:DPE_COLORS[a.dpe]||'#ddd', color:'#fff', fontWeight:500 }}>DPE {a.dpe}</span>}
                      <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:'#f0f0f0', color:'#666' }}>{a.source}</span>
                      {venduLoue && <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:'#7F77DD', color:'#fff', fontWeight:600 }}>🔑 Vendu loué</span>}
                      {a.jours_en_ligne > 30 && <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:'#F4C0D1', color:'#4B1528' }}>{a.jours_en_ligne}j en ligne</span>}
                      {a.nb_baisses > 0 && <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:'#FCEBEB', color:'#501313' }}>↘ {a.nb_baisses} baisse{a.nb_baisses>1?'s':''}</span>}
                      {a.jours_en_ligne <= 1 && <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:'#E6F1FB', color:'#042C53' }}>Nouveau</span>}
                      {a.jours_en_ligne <= 2 && calcMarge(a.surface, a.prix, params).marge >= 40000 && (
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'#D85A30', color:'#fff', fontWeight:700 }}>🔥 Priorité</span>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:12, color:'#999' }}>{a.adresse} · {a.surface}m²</span>
                      <div style={{ flex:1, height:3, background:'#eee', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${a.score||0}%`, background:'#185FA5', borderRadius:2 }} />
                      </div>
                      <span style={{ fontSize:11, color:'#666', minWidth:40, textAlign:'right' }}>{a.score||0}/100</span>
                    </div>
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                    <div style={{ fontSize:15, fontWeight:500 }}>{fmt(a.prix)}</div>
                    <div style={{ fontSize:11, color:'#999' }}>{Math.round(a.prix_m2).toLocaleString('fr-FR')} €/m²</div>
                    <div style={{ fontSize:12, fontWeight:500, color:mColor }}>{fmt(m.marge)}</div>
                    <div style={{ fontSize:11, color:mColor }}>{m.pct}% marge</div>
                    <div style={{ display:'flex', gap:4, marginTop:4 }}>
                      <button
                        onClick={e => likerAnnonce(e, a)}
                        disabled={liking === a.id}
                        title={isLiked ? 'Retirer le like' : "J'aime ce type de bien"}
                        style={{ width:28, height:28, borderRadius:6, border:`0.5px solid ${isLiked ? '#f97316' : '#e5e5e5'}`, background: isLiked ? '#fff3e6' : '#fafafa', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}
                      >{isLiked ? '❤️' : '🤍'}</button>
                      <button
                        onClick={e => supprimerAnnonce(e, a)}
                        disabled={deleting === a.id}
                        title="Retirer du dashboard"
                        style={{ width:28, height:28, borderRadius:6, border:'0.5px solid #fcc', background:'#fff5f5', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', color:'#e53e3e' }}
                      >🗑</button>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ background:'#f8f8f8', padding:'12px 16px 14px 56px', borderBottom:'0.5px solid #f0f0f0' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
                      {[
                        ['Prix achat',         fmt(a.prix)],
                        ['Travaux (1200€/m²)', fmt(a.surface * params.travaux)],
                        ['Frais notaire (8%)', fmt(a.prix * 0.08)],
                        ['Prix revente est.',  fmt(m.revente)],
                      ].map(([l,v]) => (
                        <div key={l} style={{ background:'#fff', borderRadius:6, padding:'8px 10px', border:'0.5px solid #eee' }}>
                          <div style={{ fontSize:11, color:'#999', marginBottom:2 }}>{l}</div>
                          <div style={{ fontSize:13, fontWeight:500 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:13, fontWeight:600, color:mColor }}>Marge nette : {fmt(m.marge)} ({m.pct}%)</span>
                      {a.url && (
                        <a href={a.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize:12, color:'#185FA5', textDecoration:'none', padding:'5px 12px', border:'0.5px solid #185FA5', borderRadius:6 }}>
                          Voir l'annonce →
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Panneau droit */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          <div style={{ background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:14, fontWeight:500, marginBottom:10 }}>Zone 1 — Montmartre</div>
            <ZoneMap />
            <div style={{ fontSize:11, color:'#999', marginTop:6 }}>
              Caulaincourt · Marcadet · Clignancourt · Clichy · Rochechouart
            </div>
          </div>

          {/* Profil ML */}
          <div style={{ background:'#fff', border:`0.5px solid ${stats.nb_likes >= 3 ? '#f97316' : '#e5e5e5'}`, borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:14, fontWeight:500, marginBottom:6 }}>
              Profil d'investissement
              {stats.nb_likes >= 3 && <span style={{ marginLeft:8, fontSize:11, background:'#fff3e6', color:'#c2410c', padding:'2px 7px', borderRadius:10 }}>ML actif</span>}
            </div>
            <div style={{ fontSize:12, color:'#666', lineHeight:1.6 }}>
              {stats.nb_likes === 0
                ? 'Likez des annonces ❤️ pour que le dashboard apprenne vos préférences et remonte les biens similaires.'
                : stats.nb_likes < 3
                ? `${stats.nb_likes} like${stats.nb_likes>1?'s':''} · encore ${3-stats.nb_likes} pour activer le scoring ML.`
                : `${stats.nb_likes} likes enregistrés · le scoring ML est actif et influence le classement (+25 pts max).`
              }
            </div>
          </div>

          <div style={{ background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:14, fontWeight:500, marginBottom:12 }}>Paramètres de marge</div>
            {[
              { label:'Travaux/m²',       key:'travaux', min:600,  max:2000, step:100, unit:'€' },
              { label:'Surface min (m²)', key:'surfMin', min:9,    max:100,  step:1,   unit:'m²' },
              { label:'Surface max (m²)', key:'surfMax', min:20,   max:300,  step:5,   unit:'m²' },
            ].map(({ label, key, min, max, step, unit }) => (
              <div key={key} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <span style={{ fontSize:12, color:'#666', width:110, flexShrink:0 }}>{label}</span>
                <input type="range" min={min} max={max} step={step} value={params[key]}
                  onChange={e => setParams(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                  style={{ flex:1 }} />
                <span style={{ fontSize:12, fontWeight:500, minWidth:54, textAlign:'right' }}>
                  {key==='travaux' ? params[key].toLocaleString('fr-FR') : params[key]}{unit}
                </span>
              </div>
            ))}
          </div>

          <div style={{ background:'#fff', border:'0.5px solid #e5e5e5', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:14, fontWeight:500, marginBottom:10 }}>Sources actives</div>
            {[
              { name:'Melo API',      status:'Actif', sub:'900+ sources agrégées', color:'#27500A' },
              { name:'DVF data.gouv', status:'Actif', sub:'Prix référence marché',  color:'#27500A' },
              { name:'Telegram Bot',  status:'Actif', sub:'Alertes score > 75',     color:'#27500A' },
            ].map(s => (
              <div key={s.name} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'0.5px solid #f5f5f5' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{s.name}</div>
                  <div style={{ fontSize:11, color:'#999' }}>{s.sub}</div>
                </div>
                <span style={{ fontSize:12, fontWeight:500, color:s.color, alignSelf:'center' }}>{s.status}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
      <style>{`* { box-sizing:border-box; } body { margin:0; background:#fafafa; }`}</style>
    </div>
  );
}
