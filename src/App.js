import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const TRAVAUX_M2 = 1200;
const FRAIS_NOTAIRE = 0.08;
const DUREE_PORTAGE = 12;
const FRAIS_AGENCE = 0.03;
const PRIX_REVENTE_M2 = 11500;

function calcMarge(surface, prixAchat) {
  const travaux = surface * TRAVAUX_M2;
  const notaire = prixAchat * FRAIS_NOTAIRE;
  const portage = prixAchat * 0.01 * (DUREE_PORTAGE / 12);
  const revente = surface * PRIX_REVENTE_M2;
  const agence = revente * FRAIS_AGENCE;
  const cout = prixAchat + travaux + notaire + portage + agence;
  const marge = revente - cout;
  const pct = (marge / cout) * 100;
  return { marge: Math.round(marge), pct: Math.round(pct * 10) / 10, revente: Math.round(revente) };
}

function fmt(n) {
  return Math.round(n).toLocaleString('fr-FR') + ' €';
}

const DPE_COLORS = {
  A: '#00a651', B: '#50b848', C: '#b5d334',
  D: '#fff200', E: '#f7941d', F: '#ed1c24', G: '#9e1a1a'
};

export default function App() {
  const [annonces, setAnnonces] = useState([]);
  const [stats, setStats] = useState({ total: 0, nouvelles: 0, marge_moy: 0, meilleure: null });
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('all');
  const [zone, setZone] = useState('montmartre');
  const [openId, setOpenId] = useState(null);
  const [params, setParams] = useState({
    travaux: 1200, notaire: 8, portage: 12, agence: 3, revente: 11500
  });
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('annonces')
        .select('*')
        .eq('zone', zone)
        .eq('actif', true)
        .order('score', { ascending: false })
        .limit(50);

      if (filtre === 'dpe') query = query.in('dpe', ['F', 'G']);
      if (filtre === 'drop') query = query.gt('nb_baisses', 0);
      if (filtre === 'new') query = query.lte('jours_en_ligne', 3);
      if (filtre === 'margin') query = query.gte('marge_pct', 10);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []).map(a => ({
        ...a,
        ...calcMarge(a.surface, a.prix)
      }));

      setAnnonces(rows);
      setLastUpdate(new Date());

      const { count } = await supabase
        .from('annonces')
        .select('*', { count: 'exact', head: true })
        .eq('zone', zone)
        .eq('actif', true);

      const { count: nouvelles } = await supabase
        .from('annonces')
        .select('*', { count: 'exact', head: true })
        .eq('zone', zone)
        .eq('actif', true)
        .lte('jours_en_ligne', 1);

      const marges = rows.map(a => a.pct).filter(p => p > 0);
      const moy = marges.length > 0 ? Math.round(marges.reduce((a, b) => a + b, 0) / marges.length * 10) / 10 : 0;
      const best = rows[0] || null;

      setStats({ total: count || 0, nouvelles: nouvelles || 0, marge_moy: moy, meilleure: best });
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [zone, filtre]);

  useEffect(() => { loadData(); }, [loadData]);

  const rankColors = ['#FAEEDA','#F1EFE8','#FAECE7','#E6F1FB','#EAF3DE'];
  const rankText = ['#633806','#444441','#4A1B0C','#042C53','#173404'];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: '24px 16px', background: '#fafafa', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.5 }}>
          paris<span style={{ color: '#185FA5' }}>invest</span>.ai
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EAF3DE', color: '#27500A', fontSize: 12, padding: '4px 10px', borderRadius: 20 }}>
            <span style={{ width: 7, height: 7, background: '#27500A', borderRadius: '50%', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            Données en direct
          </span>
          {lastUpdate && (
            <span style={{ fontSize: 12, color: '#888' }}>
              Mis à jour {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={loadData} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '0.5px solid #ddd', background: '#fff', cursor: 'pointer' }}>
            Actualiser
          </button>
        </div>
      </div>

      {/* Métriques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Annonces analysées', val: stats.total.toLocaleString('fr-FR'), sub: `+${stats.nouvelles} aujourd'hui` },
          { label: 'Marge nette moyenne', val: stats.marge_moy + '%', sub: 'Top 50 annonces' },
          { label: 'Meilleure opportunité', val: stats.meilleure ? fmt(stats.meilleure.prix) : '—', sub: stats.meilleure ? `Score ${stats.meilleure.score}/100` : '' },
          { label: 'Zone active', val: 'Montmartre', sub: '75018 Paris' },
        ].map((m, i) => (
          <div key={i} style={{ background: '#f0f0f0', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#111' }}>{m.val}</div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>

        {/* Liste annonces */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Top annonces — {zone === 'montmartre' ? 'Montmartre 18e' : zone}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['all','Tous'],['dpe','DPE F/G'],['drop','Baisses prix'],['new','Nouvelles'],['margin','Marge >10%']].map(([k,l]) => (
                <button key={k} onClick={() => setFiltre(k)} style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                  background: filtre === k ? '#185FA5' : 'transparent',
                  color: filtre === k ? '#fff' : '#666',
                  border: `0.5px solid ${filtre === k ? '#185FA5' : '#ddd'}`
                }}>{l}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 14 }}>Chargement...</div>
          ) : annonces.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 14 }}>Aucune annonce pour ce filtre</div>
          ) : (
            annonces.map((a, i) => {
              const isOpen = openId === a.id;
              const m = calcMarge(a.surface, a.prix);
              const margeColor = m.pct >= 15 ? '#27500A' : m.pct >= 8 ? '#854F0B' : '#A32D2D';
              return (
                <div key={a.id}>
                  <div
                    onClick={() => setOpenId(isOpen ? null : a.id)}
                    style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, padding: '12px 16px', borderBottom: '0.5px solid #f0f0f0', cursor: 'pointer', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: rankColors[Math.min(i,4)], color: rankText[Math.min(i,4)], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, flexShrink: 0, marginTop: 2 }}>
                      #{i + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titre}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
                        {a.dpe && (
                          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: DPE_COLORS[a.dpe] || '#ddd', color: '#fff', fontWeight: 500 }}>DPE {a.dpe}</span>
                        )}
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#f0f0f0', color: '#666' }}>{a.source}</span>
                        {a.jours_en_ligne > 30 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#F4C0D1', color: '#4B1528' }}>{a.jours_en_ligne}j en ligne</span>}
                        {a.nb_baisses > 0 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#FCEBEB', color: '#501313' }}>-{a.nb_baisses} baisse{a.nb_baisses > 1 ? 's' : ''}</span>}
                        {a.jours_en_ligne <= 1 && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#E6F1FB', color: '#042C53' }}>Nouveau</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#999' }}>{a.adresse}</span>
                        <div style={{ flex: 1, height: 3, background: '#eee', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${a.score || 0}%`, background: '#185FA5', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#666', minWidth: 40, textAlign: 'right' }}>{a.score || 0}/100</span>
                      </div>
                    </div>
                    <div style={{ gridColumn: '2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 500 }}>{fmt(a.prix)}</span>
                        <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>{Math.round(a.prix_m2).toLocaleString('fr-FR')} €/m²</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: margeColor }}>
                          {fmt(m.marge)} · {m.pct}%
                        </span>
                        <div style={{ fontSize: 11, color: '#999' }}>marge nette</div>
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ background: '#f8f8f8', padding: '12px 16px 14px 56px', borderBottom: '0.5px solid #f0f0f0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
                        {[
                          ['Prix achat', fmt(a.prix)],
                          ['Travaux (1 200€/m²)', fmt(a.surface * params.travaux)],
                          ['Frais notaire', fmt(a.prix * params.notaire / 100)],
                          ['Portage', fmt(a.prix * 0.01 * params.portage / 12)],
                          ['Agence revente', fmt(m.revente * params.agence / 100)],
                          ['Prix revente est.', fmt(m.revente)],
                        ].map(([l,v]) => (
                          <div key={l} style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', border: '0.5px solid #eee' }}>
                            <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{l}</div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: margeColor }}>Marge nette : {fmt(m.marge)} ({m.pct}%)</span>
                        {a.url && (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#185FA5', textDecoration: 'none', padding: '5px 12px', border: '0.5px solid #185FA5', borderRadius: 6 }}>
                            Voir l'annonce →
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Panneau droit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Paramètres marge */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Paramètres de marge</div>
            {[
              { label: 'Travaux/m²', key: 'travaux', min: 600, max: 2000, step: 100, unit: '€' },
              { label: 'Frais notaire', key: 'notaire', min: 5, max: 10, step: 0.5, unit: '%' },
              { label: 'Portage (mois)', key: 'portage', min: 6, max: 24, step: 1, unit: 'mois' },
              { label: 'Agence revente', key: 'agence', min: 2, max: 5, step: 0.5, unit: '%' },
              { label: 'Prix revente/m²', key: 'revente', min: 9000, max: 14000, step: 250, unit: '€' },
            ].map(({ label, key, min, max, step, unit }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#666', width: 110, flexShrink: 0 }}>{label}</span>
                <input type="range" min={min} max={max} step={step} value={params[key]}
                  onChange={e => setParams(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 500, minWidth: 52, textAlign: 'right' }}>
                  {key === 'revente' || key === 'travaux' ? params[key].toLocaleString('fr-FR') : params[key]}{unit}
                </span>
              </div>
            ))}
          </div>

          {/* Zones */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Zones géographiques</div>
            {[
              { id: 'montmartre', label: 'Zone 1 — Montmartre', desc: 'Clignancourt · Marcadet · Caulaincourt · Clichy' },
            ].map(z => (
              <div key={z.id} onClick={() => setZone(z.id)}
                style={{ padding: '10px 0', borderBottom: '0.5px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: zone === z.id ? '#185FA5' : '#111' }}>{z.label}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{z.desc}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{stats.total} biens</div>
                  <div style={{ fontSize: 11, color: '#27500A' }}>+{stats.nouvelles} aujourd'hui</div>
                </div>
              </div>
            ))}
            <button style={{ width: '100%', marginTop: 10, padding: '8px 0', fontSize: 13, color: '#185FA5', background: 'none', border: '0.5px dashed #185FA5', borderRadius: 8, cursor: 'pointer' }}>
              + Ajouter une zone
            </button>
          </div>

          {/* Sources */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Sources actives</div>
            {[
              { name: 'Melo API', status: 'Actif', sub: '900+ sources agrégées', color: '#27500A' },
              { name: 'DVF data.gouv', status: 'Actif', sub: 'Prix référence marché', color: '#27500A' },
              { name: 'Telegram Bot', status: 'Actif', sub: 'Alertes score > 75', color: '#27500A' },
              { name: 'LeBonCoin', status: 'En attente', sub: 'Via Melo', color: '#854F0B' },
            ].map(s => (
              <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid #f5f5f5' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{s.sub}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: s.color, alignSelf: 'center' }}>{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        * { box-sizing: border-box; }
        body { margin: 0; background: #fafafa; }
      `}</style>
    </div>
  );
}
