/* CHRSTPHR Admin — single-file editor.
   Renders forms for projects.json and how-i-work.json, autosaves on change. */

console.log('[admin] app.js loaded');

window.addEventListener('error', e => console.error('[admin] uncaught error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[admin] unhandled promise:', e.reason));

// ============ Tiny DOM helpers ============
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') node.className = attrs[k];
    else if (k === 'style') node.style.cssText = attrs[k];
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
  }
  children.flat().forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

// ============ State ============
const state = {
  projects: null,
  'how-i-work': null,
  dirty: { projects: false, 'how-i-work': false },
  saveTimers: { projects: null, 'how-i-work': null }
};

// ============ Auth ============
async function checkAuth() {
  const r = await fetch('/admin/api/me').then(r => r.json());
  return r.authed;
}
async function login(password) {
  const r = await fetch('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return r.ok;
}
async function logout() {
  await fetch('/admin/api/logout', { method: 'POST' });
  location.reload();
}

// ============ Save state UI ============
function setSaveState(s, label) {
  const el = $('#saveState');
  el.classList.remove('dirty', 'saving', 'saved');
  if (s) el.classList.add(s);
  el.textContent = label;
}

// ============ Section save (debounced) ============
async function saveSection(slug) {
  setSaveState('saving', 'Saving…');
  try {
    const r = await fetch(`/admin/api/content/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state[slug])
    });
    if (!r.ok) throw new Error('save failed: ' + r.status);
    state.dirty[slug] = false;
    setSaveState('saved', 'Saved');
    setTimeout(() => {
      if (!state.dirty.projects && !state.dirty['how-i-work']) setSaveState(null, 'All saved');
    }, 1500);
  } catch (e) {
    console.error(e);
    setSaveState('dirty', 'Save failed — retry');
  }
}
function markDirty(slug) {
  state.dirty[slug] = true;
  setSaveState('dirty', 'Unsaved…');
  clearTimeout(state.saveTimers[slug]);
  state.saveTimers[slug] = setTimeout(() => saveSection(slug), 700);
}

// ============ Field builders ============
function field(label, value, onInput, opts = {}) {
  const id = 'f-' + Math.random().toString(36).slice(2, 9);
  const input = opts.textarea
    ? el('textarea', { id, rows: opts.rows || 3 })
    : el('input', { id, type: opts.type || 'text' });
  input.value = value ?? '';
  input.addEventListener('input', () => onInput(input.value));
  const f = el('div', { class: 'field' },
    el('label', { for: id }, label),
    input,
    opts.hint ? el('div', { class: 'hint' }, opts.hint) : null
  );
  return f;
}

// ============ PROJECTS RENDERER ============
function renderProjects() {
  const root = $('#tab-projects');
  root.innerHTML = '';
  const data = state.projects;

  // ----- FEATURED -----
  const featuredBody = el('div', { class: 'group-body' });
  const f = data.featured || (data.featured = {});
  function fSet(key, value) { f[key] = value; markDirty('projects'); }
  featuredBody.append(
    el('div', { class: 'row cols-3' },
      field('Number', f.num, v => fSet('num', v)),
      field('Year', f.year, v => fSet('year', v)),
      field('Client', f.client, v => fSet('client', v))
    ),
    el('div', { class: 'row cols-2' },
      field('Role', f.role, v => fSet('role', v)),
      field('Cover tag', f.coverTag, v => fSet('coverTag', v))
    ),
    el('div', { class: 'row cols-2' },
      field('Title', f.title, v => fSet('title', v)),
      field('Title em (italic)', f.titleEm, v => fSet('titleEm', v))
    ),
    field('Cover mark (emoji/symbol)', f.coverMark, v => fSet('coverMark', v)),
    field('Description (HTML allowed)', f.description, v => fSet('description', v),
      { textarea: true, rows: 4, hint: 'You can use <span class="accent">word</span> for orange highlights.' }),
    field('Tags (comma separated)', (f.tags || []).join(', '),
      v => fSet('tags', v.split(',').map(s => s.trim()).filter(Boolean))),
    el('div', { class: 'row cols-2' },
      field('CTA href', f.ctaHref, v => fSet('ctaHref', v)),
      field('CTA label', f.ctaLabel, v => fSet('ctaLabel', v))
    )
  );
  root.append(el('div', { class: 'group' },
    el('div', { class: 'group-head' }, el('h3', {}, 'Featured Project')),
    featuredBody
  ));

  // ----- FILTERS -----
  const filtersBody = el('div', { class: 'group-body' });
  data.filters = data.filters || [];
  function renderFilters() {
    filtersBody.innerHTML = '';
    data.filters.forEach((flt, i) => {
      filtersBody.append(el('div', { class: 'item' },
        el('div', { class: 'item-head' },
          el('span', { class: 'label' }, `Filter ${i + 1}`),
          el('div', { class: 'item-controls' },
            el('button', {
              class: 'icon-btn danger',
              onclick: () => { data.filters.splice(i, 1); markDirty('projects'); renderFilters(); }
            }, '✕ Remove')
          )
        ),
        el('div', { class: 'row cols-2' },
          field('ID (slug, lowercase)', flt.id, v => { flt.id = v; markDirty('projects'); }),
          field('Label', flt.label, v => { flt.label = v; markDirty('projects'); })
        )
      ));
    });
    filtersBody.append(el('div', {
      class: 'add-row',
      onclick: () => {
        data.filters.push({ id: 'new', label: 'New' });
        markDirty('projects'); renderFilters();
      }
    }, '+ Add filter'));
  }
  renderFilters();
  root.append(el('div', { class: 'group' },
    el('div', { class: 'group-head' }, el('h3', {}, 'Filter Buttons')),
    filtersBody
  ));

  // ----- PROJECTS LIST -----
  const projBody = el('div', { class: 'group-body' });
  data.projects = data.projects || [];
  function renderProjList() {
    projBody.innerHTML = '';
    data.projects.forEach((p, i) => {
      function pSet(key, value) { p[key] = value; markDirty('projects'); }
      projBody.append(el('div', { class: 'item' },
        el('div', { class: 'item-head' },
          el('span', { class: 'label' }, `${p.num || '??'} · ${(p.title || 'Untitled').slice(0, 50)}`),
          el('div', { class: 'item-controls' },
            el('button', { class: 'icon-btn', onclick: () => moveItem('projects', i, -1, renderProjList) }, '↑'),
            el('button', { class: 'icon-btn', onclick: () => moveItem('projects', i, 1, renderProjList) }, '↓'),
            el('button', {
              class: 'icon-btn danger',
              onclick: () => {
                if (!confirm('Remove this project?')) return;
                data.projects.splice(i, 1); markDirty('projects'); renderProjList();
              }
            }, '✕ Remove')
          )
        ),
        el('div', { class: 'row cols-4' },
          field('Number', p.num, v => pSet('num', v)),
          field('Tag (display)', p.tag, v => pSet('tag', v)),
          field('Filter (slug)', p.filter, v => pSet('filter', v),
            { hint: 'Match a filter ID above (ux/ai/all).' }),
          field('Size', p.size, v => pSet('size', v),
            { hint: 's / m / l' })
        ),
        el('div', { class: 'row cols-2' },
          field('Mark (emoji)', p.mark, v => pSet('mark', v)),
          field('Link href', p.href, v => pSet('href', v))
        ),
        field('Meta (e.g. "Client · Brenz · Jan 2026")', p.meta, v => pSet('meta', v)),
        field('Title', p.title, v => pSet('title', v)),
        field('Description', p.description, v => pSet('description', v),
          { textarea: true, rows: 3 })
      ));
    });
    projBody.append(el('div', {
      class: 'add-row',
      onclick: () => {
        data.projects.push({
          num: String(data.projects.length + 2).padStart(2, '0'),
          tag: 'NEW', filter: 'all', size: 'm',
          mark: '✦', meta: '', title: 'New project', description: '', href: '#'
        });
        markDirty('projects'); renderProjList();
      }
    }, '+ Add project'));
  }
  renderProjList();
  root.append(el('div', { class: 'group' },
    el('div', { class: 'group-head' }, el('h3', {}, 'Project Grid')),
    projBody
  ));

  // ----- CASE STUDY -----
  const csBody = el('div', { class: 'group-body' });
  data.caseStudy = data.caseStudy || {};
  const cs = data.caseStudy;
  function csSet(key, value) { cs[key] = value; markDirty('projects'); }
  function renderCS() {
    csBody.innerHTML = '';
    csBody.append(
      el('div', { class: 'row cols-2' },
        field('Section label', cs.label, v => csSet('label', v)),
        field('Pill', cs.pill, v => csSet('pill', v))
      ),
      el('div', { class: 'row cols-2' },
        field('Title', cs.title, v => csSet('title', v)),
        field('Title em (italic)', cs.titleEm, v => csSet('titleEm', v))
      )
    );

    // meta row
    cs.metaRow = cs.metaRow || [];
    const metaWrap = el('div', { class: 'group', style: 'margin-top: 16px;' },
      el('div', { class: 'group-head' }, el('h3', {}, 'Case Study Meta Row'))
    );
    const metaBody = el('div', { class: 'group-body' });
    function renderMeta() {
      metaBody.innerHTML = '';
      cs.metaRow.forEach((m, i) => {
        metaBody.append(el('div', { class: 'item' },
          el('div', { class: 'item-head' },
            el('span', { class: 'label' }, `Meta ${i + 1}`),
            el('div', { class: 'item-controls' },
              el('button', { class: 'icon-btn', onclick: () => { moveArr(cs.metaRow, i, -1); markDirty('projects'); renderMeta(); } }, '↑'),
              el('button', { class: 'icon-btn', onclick: () => { moveArr(cs.metaRow, i, 1); markDirty('projects'); renderMeta(); } }, '↓'),
              el('button', { class: 'icon-btn danger', onclick: () => { cs.metaRow.splice(i, 1); markDirty('projects'); renderMeta(); } }, '✕')
            )
          ),
          el('div', { class: 'row cols-2' },
            field('Label', m.label, v => { m.label = v; markDirty('projects'); }),
            field('Value', m.value, v => { m.value = v; markDirty('projects'); })
          ),
          el('label', { style: 'font-size: 10px; text-transform: uppercase; letter-spacing: 0.22em; color: var(--fg-dim);' },
            (() => {
              const cb = el('input', { type: 'checkbox', style: 'width: auto; margin-right: 8px;' });
              cb.checked = !!m.accent;
              cb.addEventListener('change', () => { m.accent = cb.checked || undefined; markDirty('projects'); });
              return cb;
            })(),
            ' Accent (orange) value'
          )
        ));
      });
      metaBody.append(el('div', {
        class: 'add-row',
        onclick: () => { cs.metaRow.push({ label: 'New', value: '' }); markDirty('projects'); renderMeta(); }
      }, '+ Add meta'));
    }
    renderMeta();
    metaWrap.append(metaBody);
    csBody.append(metaWrap);

    // hero
    cs.hero = cs.hero || {};
    csBody.append(
      el('div', { class: 'group', style: 'margin-top: 16px;' },
        el('div', { class: 'group-head' }, el('h3', {}, 'Case Study Hero')),
        el('div', { class: 'group-body' },
          el('div', { class: 'row cols-2' },
            field('Mark', cs.hero.mark, v => { cs.hero.mark = v; markDirty('projects'); }),
            field('Caption', cs.hero.caption, v => { cs.hero.caption = v; markDirty('projects'); })
          )
        )
      )
    );

    // sections
    cs.sections = cs.sections || [];
    const secWrap = el('div', { class: 'group', style: 'margin-top: 16px;' },
      el('div', { class: 'group-head' }, el('h3', {}, 'Case Study Sections'))
    );
    const secBody = el('div', { class: 'group-body' });
    function renderSecs() {
      secBody.innerHTML = '';
      cs.sections.forEach((s, i) => {
        secBody.append(el('div', { class: 'item' },
          el('div', { class: 'item-head' },
            el('span', { class: 'label' }, `Section ${i + 1}`),
            el('div', { class: 'item-controls' },
              el('button', { class: 'icon-btn', onclick: () => { moveArr(cs.sections, i, -1); markDirty('projects'); renderSecs(); } }, '↑'),
              el('button', { class: 'icon-btn', onclick: () => { moveArr(cs.sections, i, 1); markDirty('projects'); renderSecs(); } }, '↓'),
              el('button', { class: 'icon-btn danger', onclick: () => { cs.sections.splice(i, 1); markDirty('projects'); renderSecs(); } }, '✕')
            )
          ),
          el('div', { class: 'row cols-2' },
            field('Number (e.g. "01 / Brief")', s.num, v => { s.num = v; markDirty('projects'); }),
            field('Headline (HTML allowed)', s.headline, v => { s.headline = v; markDirty('projects'); })
          ),
          field('Paragraphs (one per line, blank lines preserved)',
            (s.paragraphs || []).join('\n---\n'),
            v => { s.paragraphs = v.split(/\n---\n/).map(p => p.trim()).filter(Boolean); markDirty('projects'); },
            { textarea: true, rows: 6, hint: 'Separate paragraphs with --- on their own line. HTML allowed.' }),
          field('Pull quote (optional)', s.pullQuote, v => { s.pullQuote = v || undefined; markDirty('projects'); })
        ));
      });
      secBody.append(el('div', {
        class: 'add-row',
        onclick: () => { cs.sections.push({ num: '', headline: '', paragraphs: [] }); markDirty('projects'); renderSecs(); }
      }, '+ Add section'));
    }
    renderSecs();
    secWrap.append(secBody);
    csBody.append(secWrap);

    // stats
    cs.stats = cs.stats || [];
    const statsWrap = el('div', { class: 'group', style: 'margin-top: 16px;' },
      el('div', { class: 'group-head' }, el('h3', {}, 'Case Study Stats'))
    );
    const statsBody = el('div', { class: 'group-body' });
    function renderStats() {
      statsBody.innerHTML = '';
      cs.stats.forEach((st, i) => {
        statsBody.append(el('div', { class: 'item' },
          el('div', { class: 'item-head' },
            el('span', { class: 'label' }, `Stat ${i + 1}`),
            el('div', { class: 'item-controls' },
              el('button', { class: 'icon-btn', onclick: () => { moveArr(cs.stats, i, -1); markDirty('projects'); renderStats(); } }, '↑'),
              el('button', { class: 'icon-btn', onclick: () => { moveArr(cs.stats, i, 1); markDirty('projects'); renderStats(); } }, '↓'),
              el('button', { class: 'icon-btn danger', onclick: () => { cs.stats.splice(i, 1); markDirty('projects'); renderStats(); } }, '✕')
            )
          ),
          el('div', { class: 'row cols-2' },
            field('Number', st.num, v => { st.num = v; markDirty('projects'); }),
            field('Label', st.label, v => { st.label = v; markDirty('projects'); })
          )
        ));
      });
      statsBody.append(el('div', {
        class: 'add-row',
        onclick: () => { cs.stats.push({ num: '', label: '' }); markDirty('projects'); renderStats(); }
      }, '+ Add stat'));
    }
    renderStats();
    statsWrap.append(statsBody);
    csBody.append(statsWrap);

    // nav
    cs.nav = cs.nav || {};
    cs.nav.prev = cs.nav.prev || {};
    cs.nav.next = cs.nav.next || {};
    csBody.append(
      el('div', { class: 'group', style: 'margin-top: 16px;' },
        el('div', { class: 'group-head' }, el('h3', {}, 'Case Study Prev/Next Nav')),
        el('div', { class: 'group-body' },
          el('div', { class: 'item' },
            el('div', { class: 'item-head' }, el('span', { class: 'label' }, 'Previous')),
            el('div', { class: 'row cols-3' },
              field('Number', cs.nav.prev.num, v => { cs.nav.prev.num = v; markDirty('projects'); }),
              field('Title', cs.nav.prev.title, v => { cs.nav.prev.title = v; markDirty('projects'); }),
              field('Href', cs.nav.prev.href, v => { cs.nav.prev.href = v; markDirty('projects'); })
            )
          ),
          el('div', { class: 'item' },
            el('div', { class: 'item-head' }, el('span', { class: 'label' }, 'Next')),
            el('div', { class: 'row cols-3' },
              field('Number', cs.nav.next.num, v => { cs.nav.next.num = v; markDirty('projects'); }),
              field('Title', cs.nav.next.title, v => { cs.nav.next.title = v; markDirty('projects'); }),
              field('Href', cs.nav.next.href, v => { cs.nav.next.href = v; markDirty('projects'); })
            )
          )
        )
      )
    );
  }
  renderCS();
  root.append(el('div', { class: 'group' },
    el('div', { class: 'group-head' }, el('h3', {}, 'Case Study')),
    csBody
  ));
}

// ============ HOW I WORK RENDERER ============
function renderHowIWork() {
  const root = $('#tab-how-i-work');
  root.innerHTML = '';
  const data = state['how-i-work'];

  // Process
  data.process = data.process || { phases: [] };
  const p = data.process;
  const procBody = el('div', { class: 'group-body' });
  procBody.append(
    el('div', { class: 'row cols-2' },
      field('Section label', p.label, v => { p.label = v; markDirty('how-i-work'); }),
      field('Headline (HTML allowed)', p.headline, v => { p.headline = v; markDirty('how-i-work'); })
    )
  );
  const phasesGroup = el('div', { class: 'group', style: 'margin-top: 16px;' },
    el('div', { class: 'group-head' }, el('h3', {}, 'Phases'))
  );
  const phasesBody = el('div', { class: 'group-body' });
  function renderPhases() {
    phasesBody.innerHTML = '';
    p.phases = p.phases || [];
    p.phases.forEach((ph, i) => {
      phasesBody.append(el('div', { class: 'item' },
        el('div', { class: 'item-head' },
          el('span', { class: 'label' }, `${ph.num || '??'} · ${ph.name || 'Untitled'}`),
          el('div', { class: 'item-controls' },
            el('button', { class: 'icon-btn', onclick: () => { moveArr(p.phases, i, -1); markDirty('how-i-work'); renderPhases(); } }, '↑'),
            el('button', { class: 'icon-btn', onclick: () => { moveArr(p.phases, i, 1); markDirty('how-i-work'); renderPhases(); } }, '↓'),
            el('button', { class: 'icon-btn danger', onclick: () => { p.phases.splice(i, 1); markDirty('how-i-work'); renderPhases(); } }, '✕')
          )
        ),
        el('div', { class: 'row cols-2' },
          field('Number', ph.num, v => { ph.num = v; markDirty('how-i-work'); }),
          field('Name', ph.name, v => { ph.name = v; markDirty('how-i-work'); })
        ),
        field('Headline (HTML allowed)', ph.headline, v => { ph.headline = v; markDirty('how-i-work'); }),
        field('Description', ph.description, v => { ph.description = v; markDirty('how-i-work'); }, { textarea: true }),
        field('Deliverable', ph.deliverable, v => { ph.deliverable = v; markDirty('how-i-work'); })
      ));
    });
    phasesBody.append(el('div', {
      class: 'add-row',
      onclick: () => {
        p.phases.push({ num: String(p.phases.length + 1).padStart(2, '0'), name: 'New', headline: '', description: '', deliverable: '' });
        markDirty('how-i-work'); renderPhases();
      }
    }, '+ Add phase'));
  }
  renderPhases();
  phasesGroup.append(phasesBody);
  procBody.append(phasesGroup);
  root.append(el('div', { class: 'group' },
    el('div', { class: 'group-head' }, el('h3', {}, 'The Process')),
    procBody
  ));

  // Principles
  data.principles = data.principles || { items: [] };
  const pr = data.principles;
  const prBody = el('div', { class: 'group-body' });
  prBody.append(
    el('div', { class: 'row cols-2' },
      field('Section label', pr.label, v => { pr.label = v; markDirty('how-i-work'); }),
      field('Headline (HTML allowed)', pr.headline, v => { pr.headline = v; markDirty('how-i-work'); })
    )
  );
  const prGroup = el('div', { class: 'group', style: 'margin-top: 16px;' },
    el('div', { class: 'group-head' }, el('h3', {}, 'Principles'))
  );
  const prItems = el('div', { class: 'group-body' });
  function renderPrinciples() {
    prItems.innerHTML = '';
    pr.items = pr.items || [];
    pr.items.forEach((it, i) => {
      prItems.append(el('div', { class: 'item' },
        el('div', { class: 'item-head' },
          el('span', { class: 'label' }, `${it.num || '??'}`),
          el('div', { class: 'item-controls' },
            el('button', { class: 'icon-btn', onclick: () => { moveArr(pr.items, i, -1); markDirty('how-i-work'); renderPrinciples(); } }, '↑'),
            el('button', { class: 'icon-btn', onclick: () => { moveArr(pr.items, i, 1); markDirty('how-i-work'); renderPrinciples(); } }, '↓'),
            el('button', { class: 'icon-btn danger', onclick: () => { pr.items.splice(i, 1); markDirty('how-i-work'); renderPrinciples(); } }, '✕')
          )
        ),
        field('Number', it.num, v => { it.num = v; markDirty('how-i-work'); }),
        field('Quote (HTML allowed)', it.quote, v => { it.quote = v; markDirty('how-i-work'); }, { textarea: true, rows: 2 }),
        field('Explanation', it.explain, v => { it.explain = v; markDirty('how-i-work'); }, { textarea: true })
      ));
    });
    prItems.append(el('div', {
      class: 'add-row',
      onclick: () => { pr.items.push({ num: 'P/' + String(pr.items.length + 1).padStart(2, '0'), quote: '', explain: '' }); markDirty('how-i-work'); renderPrinciples(); }
    }, '+ Add principle'));
  }
  renderPrinciples();
  prGroup.append(prItems);
  prBody.append(prGroup);
  root.append(el('div', { class: 'group' },
    el('div', { class: 'group-head' }, el('h3', {}, 'Principles')),
    prBody
  ));

  // Toolbox: tools + rituals
  data.toolbox = data.toolbox || {};
  const tb = data.toolbox;
  tb.tools = tb.tools || { title: '', items: [] };
  tb.rituals = tb.rituals || { title: '', items: [] };
  const tbBody = el('div', { class: 'group-body' });
  tbBody.append(
    el('div', { class: 'row cols-2' },
      field('Section label', tb.label, v => { tb.label = v; markDirty('how-i-work'); }),
      field('Headline (HTML allowed)', tb.headline, v => { tb.headline = v; markDirty('how-i-work'); })
    )
  );
  function buildList(col, isTools, slug) {
    const wrap = el('div', { class: 'group', style: 'margin-top: 16px;' },
      el('div', { class: 'group-head' }, el('h3', {}, slug + ' · Title editable below'))
    );
    const body = el('div', { class: 'group-body' });
    body.append(field('Column title', col.title, v => { col.title = v; markDirty('how-i-work'); }));
    function render() {
      const itemsWrap = body.querySelector('.items-wrap');
      if (itemsWrap) itemsWrap.remove();
      const iw = el('div', { class: 'items-wrap' });
      col.items = col.items || [];
      col.items.forEach((it, i) => {
        iw.append(el('div', { class: 'item' },
          el('div', { class: 'item-head' },
            el('span', { class: 'label' }, `${it.name || 'Untitled'}`),
            el('div', { class: 'item-controls' },
              el('button', { class: 'icon-btn', onclick: () => { moveArr(col.items, i, -1); markDirty('how-i-work'); render(); } }, '↑'),
              el('button', { class: 'icon-btn', onclick: () => { moveArr(col.items, i, 1); markDirty('how-i-work'); render(); } }, '↓'),
              el('button', { class: 'icon-btn danger', onclick: () => { col.items.splice(i, 1); markDirty('how-i-work'); render(); } }, '✕')
            )
          ),
          el('div', { class: 'row cols-2' },
            field('Name', it.name, v => { it.name = v; markDirty('how-i-work'); }),
            field('Annotation', it.annot, v => { it.annot = v; markDirty('how-i-work'); })
          ),
          isTools
            ? el('div', { class: 'row cols-2' },
                field('Level (e.g. Expert)', it.level, v => { it.level = v; markDirty('how-i-work'); }),
                field('Tooltip (optional)', it.tip, v => { it.tip = v || undefined; markDirty('how-i-work'); })
              )
            : field('Description', it.desc, v => { it.desc = v; markDirty('how-i-work'); })
        ));
      });
      iw.append(el('div', {
        class: 'add-row',
        onclick: () => {
          col.items.push(isTools
            ? { name: 'New tool', annot: '', level: '' }
            : { name: 'New ritual', annot: '', desc: '' });
          markDirty('how-i-work'); render();
        }
      }, isTools ? '+ Add tool' : '+ Add ritual'));
      body.append(iw);
    }
    render();
    wrap.append(body);
    return wrap;
  }
  tbBody.append(buildList(tb.tools, true, 'Tools'));
  tbBody.append(buildList(tb.rituals, false, 'Rituals'));
  root.append(el('div', { class: 'group' },
    el('div', { class: 'group-head' }, el('h3', {}, 'The Toolbox')),
    tbBody
  ));

  // Manifesto
  data.manifesto = data.manifesto || {};
  const m = data.manifesto;
  root.append(el('div', { class: 'group' },
    el('div', { class: 'group-head' }, el('h3', {}, 'Manifesto')),
    el('div', { class: 'group-body' },
      field('Text (HTML allowed)', m.text, v => { m.text = v; markDirty('how-i-work'); }, { textarea: true, rows: 3 }),
      field('Signature', m.signature, v => { m.signature = v; markDirty('how-i-work'); })
    )
  ));
}

// ============ Helpers ============
function moveArr(arr, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return;
  const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
}
function moveItem(slug, i, delta, rerender) {
  moveArr(state[slug].projects, i, delta);
  markDirty(slug); rerender();
}

// ============ Boot ============
async function attemptLogin() {
  console.log('[admin] attemptLogin');
  const pwInput = $('#pw');
  const errEl = $('#err');
  const pw = pwInput ? pwInput.value : '';
  errEl && (errEl.textContent = '');
  try {
    const ok = await login(pw);
    console.log('[admin] login response ok =', ok);
    if (ok) {
      $('#loginView').classList.add('hidden');
      $('#adminView').classList.remove('hidden');
      await loadAll();
    } else {
      errEl && (errEl.textContent = 'Wrong password.');
    }
  } catch (e) {
    console.error('[admin] login threw:', e);
    errEl && (errEl.textContent = 'Login error — check console.');
  }
  return false;
}

function boot() {
  console.log('[admin] boot');

  const form = document.getElementById('loginForm');
  const btn  = document.getElementById('loginBtn');

  if (!form) console.error('[admin] #loginForm not found at boot');
  if (!btn)  console.error('[admin] #loginBtn not found at boot');

  // Triple redundancy on the submit:
  //  1) <form onsubmit="return false"> in HTML (prevents naive submit)
  //  2) submit event listener
  //  3) click on the button
  if (form) {
    form.addEventListener('submit', (e) => {
      console.log('[admin] form submit fired');
      e.preventDefault();
      e.stopPropagation();
      attemptLogin();
      return false;
    });
  }
  if (btn) {
    btn.addEventListener('click', (e) => {
      console.log('[admin] login button clicked');
      e.preventDefault();
      e.stopPropagation();
      attemptLogin();
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  $$('.tab').forEach(t => {
    t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      t.classList.add('active');
      $('#tab-' + t.dataset.tab).classList.add('active');
    });
  });

  // Copy-to-clipboard buttons in the footer help block
  $$('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      // Grab text content but strip the button's own label
      const code = Array.from(target.childNodes)
        .filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.classList.contains('copy-btn')))
        .map(n => n.textContent).join('').trim();
      try {
        await navigator.clipboard.writeText(code);
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1500);
      } catch (err) {
        console.error('[admin] copy failed:', err);
        btn.textContent = 'Copy failed';
      }
    });
  });

  // Then asynchronously check if already authenticated
  checkAuth().then(authed => {
    console.log('[admin] checkAuth =', authed);
    if (authed) {
      $('#loginView').classList.add('hidden');
      $('#adminView').classList.remove('hidden');
      loadAll().catch(e => console.error('[admin] loadAll threw:', e));
    }
  }).catch(e => console.error('[admin] checkAuth threw:', e));
}

async function loadAll() {
  state.projects = await fetch('/admin/api/content/projects').then(r => r.json());
  state['how-i-work'] = await fetch('/admin/api/content/how-i-work').then(r => r.json());
  renderProjects();
  renderHowIWork();
  setSaveState(null, 'All saved');
}

boot();
