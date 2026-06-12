// Show Explorer: setlist browser + mood arc visualization
// Data: data/shows.json produced by Processing/export_show_data.py

let DATA = null;            // { features, songs, shows }
let showsByYear = new Map(); // year -> [show indices]
let currentShowIdx = null;
let compareShowIdx = null;

const FEATURE_STYLE = {
    energy:       { color: "#e74c3c", label: "Energy (loudness)",   unit: "LUFS", on: true },
    tempo:        { color: "#4da6ff", label: "Tempo",               unit: "BPM",  on: true },
    danceability: { color: "#2ecc71", label: "Danceability",        unit: "",     on: false },
    brightness:   { color: "#f1c40f", label: "Brightness (timbre)", unit: "Hz",   on: false },
    dynamics:     { color: "#9b59b6", label: "Dynamic range",       unit: "LU",   on: false },
};

const SET_LABELS = { set1: "Set 1", set2: "Set 2", epilogue: "Encore" };

// ---------- Boilerplate: theme + mobile sidebar ----------
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    document.getElementById('theme-toggle').innerText = isLight ? '☀️' : '🌙';
    renderChart();
});

const sidebar = document.getElementById('sidebar');
document.getElementById('mobile-menu-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('show');
});
const mobileClose = document.getElementById('sidebar-close');
if (mobileClose) mobileClose.addEventListener('click', () => sidebar.classList.remove('show'));

// ---------- Data loading ----------
d3.json("data/shows.json").then(data => {
    DATA = data;
    data.shows.forEach((s, i) => {
        const year = s.date.substring(0, 4);
        if (!showsByYear.has(year)) showsByYear.set(year, []);
        showsByYear.get(year).push(i);
    });

    buildFeatureToggles();
    populateYearSelect(document.getElementById('year-select'));
    populateYearSelect(document.getElementById('compare-year-select'), true);

    applyHashSelection();
    window.addEventListener('hashchange', applyHashSelection);
});

// Deep link support: #YYYY-MM-DD or #YYYY-MM-DD|YYYY-MM-DD
function applyHashSelection() {
    const hash = decodeURIComponent(window.location.hash.replace('#', ''));
    const [d1, d2] = hash.split('|');
    let initial = d1 ? DATA.shows.findIndex(s => s.date === d1) : -1;
    if (initial === -1) initial = DATA.shows.findIndex(s => s.date === '1977-05-08');
    if (initial === -1) initial = 0;
    compareShowIdx = null;
    if (d2) {
        const cmp = DATA.shows.findIndex(s => s.date === d2);
        if (cmp !== -1) compareShowIdx = cmp;
    }
    selectShow(initial);
}

// ---------- Sidebar controls ----------
function buildFeatureToggles() {
    const wrap = document.getElementById('feature-toggles');
    DATA.features.forEach(name => {
        const style = FEATURE_STYLE[name];
        if (!style) return;
        const label = document.createElement('label');
        label.className = 'feature-toggle';
        label.innerHTML = `<input type="checkbox" ${style.on ? 'checked' : ''}>` +
            `<span class="feature-swatch" style="background:${style.color}"></span>${style.label}`;
        label.querySelector('input').addEventListener('change', (e) => {
            style.on = e.target.checked;
            renderChart();
        });
        wrap.appendChild(label);
    });
}

function populateYearSelect(selectEl, isCompare = false) {
    selectEl.innerHTML = isCompare ? '<option value="">-- None --</option>' : '';
    [...showsByYear.keys()].sort().forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.innerText = `${y} (${showsByYear.get(y).length} shows)`;
        selectEl.appendChild(opt);
    });
    selectEl.addEventListener('change', () => {
        const showSelect = document.getElementById(isCompare ? 'compare-show-select' : 'show-select');
        populateShowSelect(showSelect, selectEl.value, isCompare);
        if (!isCompare && selectEl.value) {
            selectShow(showsByYear.get(selectEl.value)[0]);
        }
    });
}

function populateShowSelect(selectEl, year, isCompare = false) {
    selectEl.innerHTML = isCompare ? '<option value="">-- Select Show --</option>' : '';
    if (!year || !showsByYear.has(year)) return;
    showsByYear.get(year).forEach(i => {
        const s = DATA.shows[i];
        const opt = document.createElement('option');
        opt.value = i;
        opt.innerText = `${s.date} — ${s.venue}${s.city ? ', ' + s.city : ''}`;
        selectEl.appendChild(opt);
    });
    if (!selectEl.dataset.bound) {
        selectEl.dataset.bound = "1";
        selectEl.addEventListener('change', () => {
            if (selectEl.value === "") return;
            if (isCompare) {
                compareShowIdx = parseInt(selectEl.value);
                updateHash();
                renderAll();
            } else {
                selectShow(parseInt(selectEl.value));
            }
        });
    }
}

document.getElementById('btn-prev-show').addEventListener('click', () => {
    if (currentShowIdx > 0) selectShow(currentShowIdx - 1);
});
document.getElementById('btn-next-show').addEventListener('click', () => {
    if (currentShowIdx < DATA.shows.length - 1) selectShow(currentShowIdx + 1);
});
document.getElementById('btn-random-show').addEventListener('click', () => {
    selectShow(Math.floor(Math.random() * DATA.shows.length));
});
document.getElementById('btn-clear-compare').addEventListener('click', () => {
    compareShowIdx = null;
    document.getElementById('compare-year-select').value = "";
    document.getElementById('compare-show-select').innerHTML = '<option value="">-- Select Show --</option>';
    updateHash();
    renderAll();
});
document.getElementById('btn-download-csv').addEventListener('click', downloadCsv);
window.addEventListener('resize', () => renderChart());

function selectShow(idx) {
    currentShowIdx = idx;
    const show = DATA.shows[idx];
    const year = show.date.substring(0, 4);
    const yearSelect = document.getElementById('year-select');
    if (yearSelect.value !== year) {
        yearSelect.value = year;
        populateShowSelect(document.getElementById('show-select'), year, false);
    }
    document.getElementById('show-select').value = idx;
    updateHash();
    renderAll();
}

function updateHash() {
    if (currentShowIdx === null) return;
    let hash = DATA.shows[currentShowIdx].date;
    if (compareShowIdx !== null) hash += '|' + DATA.shows[compareShowIdx].date;
    history.replaceState(null, '', '#' + hash);
}

// ---------- Rendering ----------
function renderAll() {
    const show = DATA.shows[currentShowIdx];
    document.getElementById('show-title').innerText =
        `${formatDate(show.date)} — ${show.venue}`;
    const locBits = [show.city, show.state].filter(Boolean).join(', ');
    let subtitle = locBits;
    if (compareShowIdx !== null) {
        const c = DATA.shows[compareShowIdx];
        subtitle += `   ·   compared with ${formatDate(c.date)} — ${c.venue} (dashed)`;
    }
    document.getElementById('show-subtitle').innerText = subtitle;

    renderSetlists();
    renderChart();
}

function formatDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${m}/${d}/${y}`;
}

// Flatten a show into one point per song with set info attached
function flattenShow(show) {
    const points = [];
    show.sets.forEach((set, setIdx) => {
        set.songs.forEach(([songIdx, segue], posInSet) => {
            const song = DATA.songs[songIdx];
            points.push({
                title: song.t,
                raw: song.raw || null,
                pct: song.pct || null,
                segue: !!segue,
                setType: set.type,
                setIdx: setIdx,
                posInSet: posInSet,
            });
        });
    });
    points.forEach((p, i) => p.index = i);
    return points;
}

function renderSetlists() {
    const container = document.getElementById('setlists-container');
    container.innerHTML = '';
    container.appendChild(buildSetlistColumn(DATA.shows[currentShowIdx]));
    if (compareShowIdx !== null) {
        container.appendChild(buildSetlistColumn(DATA.shows[compareShowIdx], true));
    }
}

function buildSetlistColumn(show, isCompare = false) {
    const col = document.createElement('div');
    col.className = 'setlist-column';
    const h = document.createElement('h3');
    h.innerText = (isCompare ? '⇄ ' : '') + `${formatDate(show.date)} — ${show.venue}`;
    col.appendChild(h);

    show.sets.forEach(set => {
        const h4 = document.createElement('h4');
        h4.innerText = SET_LABELS[set.type] || set.type;
        col.appendChild(h4);
        const ol = document.createElement('ol');
        set.songs.forEach(([songIdx, segue]) => {
            const song = DATA.songs[songIdx];
            const li = document.createElement('li');
            li.innerHTML = song.t +
                (segue ? ' <span class="segue-arrow">→</span>' : '') +
                (song.pct ? '' : ' <span class="no-features">(no audio features)</span>');
            ol.appendChild(li);
        });
        col.appendChild(ol);
    });
    return col;
}

function renderChart() {
    if (!DATA || currentShowIdx === null) return;

    const svg = d3.select('#arc-chart');
    svg.selectAll('*').remove();

    const containerWidth = document.getElementById('arc-chart-container').clientWidth;
    const W = Math.max(360, containerWidth);
    const H = 340;
    const margin = { top: 28, right: 20, bottom: 70, left: 48 };
    svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);

    const primary = flattenShow(DATA.shows[currentShowIdx]);
    const compare = compareShowIdx !== null ? flattenShow(DATA.shows[compareShowIdx]) : null;

    const x = d3.scaleLinear()
        .domain([0, Math.max(primary.length - 1, 1)])
        .range([margin.left, W - margin.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([H - margin.bottom, margin.top]);

    // Y axis: catalog percentile
    svg.append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%')));
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(H - margin.bottom + margin.top) / 2)
        .attr('y', 14)
        .attr('text-anchor', 'middle')
        .text('catalog percentile');

    // X axis: song titles, rotated
    const xAxis = d3.axisBottom(x)
        .ticks(Math.min(primary.length, 30))
        .tickFormat(i => {
            const p = primary[Math.round(i)];
            if (!p) return '';
            return p.title.length > 14 ? p.title.slice(0, 13) + '…' : p.title;
        });
    svg.append('g')
        .attr('transform', `translate(0,${H - margin.bottom})`)
        .call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-40)')
        .style('text-anchor', 'end');

    // Set dividers + labels (primary show)
    let prevSetIdx = 0;
    primary.forEach(p => {
        if (p.setIdx !== prevSetIdx) {
            const xPos = x(p.index - 0.5);
            svg.append('line').attr('class', 'set-divider')
                .attr('x1', xPos).attr('x2', xPos)
                .attr('y1', margin.top).attr('y2', H - margin.bottom);
            prevSetIdx = p.setIdx;
        }
    });
    const setStarts = {};
    primary.forEach(p => {
        if (!(p.setIdx in setStarts)) setStarts[p.setIdx] = p;
    });
    Object.values(setStarts).forEach(p => {
        svg.append('text').attr('class', 'set-label')
            .attr('x', x(p.index)).attr('y', margin.top - 10)
            .text(SET_LABELS[p.setType] || p.setType);
    });

    const enabled = DATA.features.filter(f => FEATURE_STYLE[f] && FEATURE_STYLE[f].on);

    // Line generator with gaps where a song has no features
    function drawSeries(points, xMap, dashed) {
        enabled.forEach(feat => {
            const style = FEATURE_STYLE[feat];
            const line = d3.line()
                .defined(p => p.pct && feat in p.pct)
                .x(p => xMap(p))
                .y(p => y(p.pct ? p.pct[feat] : 0))
                .curve(d3.curveMonotoneX);
            svg.append('path')
                .datum(points)
                .attr('fill', 'none')
                .attr('stroke', style.color)
                .attr('stroke-width', dashed ? 1.5 : 2.5)
                .attr('stroke-dasharray', dashed ? '5 4' : null)
                .attr('opacity', dashed ? 0.7 : 0.95)
                .attr('d', line);

            svg.selectAll(null)
                .data(points.filter(p => p.pct && feat in p.pct))
                .enter().append('circle')
                .attr('cx', p => xMap(p))
                .attr('cy', p => y(p.pct[feat]))
                .attr('r', dashed ? 2.5 : 3.5)
                .attr('fill', style.color)
                .attr('opacity', dashed ? 0.7 : 1)
                .style('cursor', 'pointer')
                .on('mousemove', (event, p) => showTooltip(event, p, dashed))
                .on('mouseleave', hideTooltip);
        });
    }

    drawSeries(primary, p => x(p.index), false);
    if (compare && compare.length > 1) {
        // Map the comparison show onto the primary axis by show progress,
        // so arcs of different lengths align start-to-end
        const scale = (primary.length - 1) / (compare.length - 1);
        drawSeries(compare, p => x(p.index * scale), true);
    }
}

function showTooltip(event, p, isCompare) {
    const tt = document.getElementById('arc-tooltip');
    const show = DATA.shows[isCompare ? compareShowIdx : currentShowIdx];
    let html = `<div class="tt-title">${p.title}</div>`;
    html += `<div class="tt-row"><span>${formatDate(show.date)}</span><span>${SET_LABELS[p.setType] || p.setType}, #${p.posInSet + 1}</span></div>`;
    if (p.raw) {
        DATA.features.forEach(feat => {
            if (!(feat in p.raw)) return;
            const style = FEATURE_STYLE[feat];
            const pctVal = p.pct && feat in p.pct ? ` (${Math.round(p.pct[feat] * 100)}%)` : '';
            html += `<div class="tt-row"><span style="color:${style.color}">${style.label}</span>` +
                `<span>${p.raw[feat]}${style.unit ? ' ' + style.unit : ''}${pctVal}</span></div>`;
        });
    }
    tt.innerHTML = html;
    tt.classList.remove('hidden');
    const rect = document.getElementById('arc-chart-container').getBoundingClientRect();
    let left = event.clientX - rect.left + 14;
    if (left > rect.width - 280) left = event.clientX - rect.left - 280;
    tt.style.left = `${left}px`;
    tt.style.top = `${event.clientY - rect.top + 10}px`;
}

function hideTooltip() {
    document.getElementById('arc-tooltip').classList.add('hidden');
}

// ---------- CSV export ----------
function downloadCsv() {
    const shows = [currentShowIdx];
    if (compareShowIdx !== null) shows.push(compareShowIdx);

    const cols = ['date', 'venue', 'set', 'position', 'song', 'segue'];
    DATA.features.forEach(f => cols.push(`${f}_raw`, `${f}_pctile`));
    const rows = [cols.join(',')];

    shows.forEach(idx => {
        const show = DATA.shows[idx];
        flattenShow(show).forEach(p => {
            const row = [
                show.date,
                `"${show.venue.replace(/"/g, '""')}"`,
                SET_LABELS[p.setType] || p.setType,
                p.posInSet + 1,
                `"${p.title.replace(/"/g, '""')}"`,
                p.segue ? 1 : 0,
            ];
            DATA.features.forEach(f => {
                row.push(p.raw && f in p.raw ? p.raw[f] : '');
                row.push(p.pct && f in p.pct ? p.pct[f] : '');
            });
            rows.push(row.join(','));
        });
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gd_show_${DATA.shows[currentShowIdx].date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}
