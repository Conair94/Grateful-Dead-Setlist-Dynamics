let rawNodes = [];
let rawNodesMap = new Map();
let rawEdges = [];
let currentFilteredEdges = []; // Store the currently filtered edges globally
let graphData = { nodes: [], links: [] };

let simulation;
let svg, container;
let nodeElements, linkElements, labelElements;
let selectedNode = null; // Track currently selected node

// Animation & Timeline State
let uniqueDates = [];
let isPlaying = false;
let animInterval = null;

// Comparative/Delta State
let isDeltaMode = false;

// Layer Groups
let linkGroup, nodeGroup, labelGroup;

// Physics parameters
let repulsionStrength = -300;
let linkDistance = 100;

// Set up SVG
const graphContainer = document.getElementById('graph-container');
const width = graphContainer.clientWidth;
const height = window.innerHeight;

svg = d3.select("#graph-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .on("click", (event) => {
        // If clicking on the background (SVG itself), clear selection
        if (event.target.tagName === 'svg') {
            clearSelection();
        }
    });

// Add a group for zooming/panning
container = svg.append("g");

const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
        container.attr("transform", event.transform);
    });

svg.call(zoom);

// Defs and Layers
container.append("defs").append("marker")
    .attr("id", "end")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 15)
    .attr("refY", -0.5)
    .attr("markerWidth", 4)
    .attr("markerHeight", 4)
    .attr("orient", "auto")
    .append("path")
    .attr("fill", "var(--link-color)")
    .attr("d", "M0,-5L10,0L0,5");

linkGroup = container.append("g").attr("class", "layer-links");
nodeGroup = container.append("g").attr("class", "layer-nodes");
labelGroup = container.append("g").attr("class", "layer-labels");

// Initialize random 1-year timeframe to prevent initial lag
const randomYear = Math.floor(Math.random() * (1995 - 1965 + 1)) + 1965;
document.getElementById('start-date').value = `${randomYear}-01`;
document.getElementById('end-date').value = `${randomYear}-12`;

// Load data
d3.json("data/graph_data.json").then(data => {
    rawNodes = data.nodes;
    rawNodes.forEach(n => rawNodesMap.set(n.id, n));
    rawEdges = data.edges;

    // Extract sorted unique dates for sliding window mode
    uniqueDates = [...new Set(rawEdges.map(e => e.date.split('T')[0]))].sort();
    
    const scrubber = document.getElementById('timeline-scrubber');
    const windowSizeEl = document.getElementById('window-size');
    const windowSize = windowSizeEl ? parseInt(windowSizeEl.value) : 100;
    if (scrubber) {
        scrubber.max = Math.max(0, uniqueDates.length - windowSize);
    }

    // Setup autocomplete list
    const datalist = document.getElementById('song-list');
    rawNodes.forEach(n => {
        if (n.type === 'song') {
            const option = document.createElement('option');
            option.value = n.title;
            datalist.appendChild(option);
        }
    });

    updateGraph();
});

// Event Listeners Initialization
function initEventListeners() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            themeToggle.innerText = isLight ? '☀️' : '🌙';
        });
    }

    // --- Timeline & Animation Controls ---
    const timeMode = document.getElementById('time-mode');
    if (timeMode) {
        timeMode.addEventListener('change', (e) => {
            if (e.target.value === 'range') {
                document.getElementById('mode-range-container').classList.remove('hidden');
                document.getElementById('mode-window-container').classList.add('hidden');
            } else {
                document.getElementById('mode-range-container').classList.add('hidden');
                document.getElementById('mode-window-container').classList.remove('hidden');
            }
            updateGraph();
        });
    }

    const windowSizeInput = document.getElementById('window-size');
    if (windowSizeInput) {
        windowSizeInput.addEventListener('input', (e) => {
            document.getElementById('window-size-val').innerText = e.target.value;
            const scrubber = document.getElementById('timeline-scrubber');
            scrubber.max = Math.max(0, uniqueDates.length - parseInt(e.target.value));
            if (parseInt(scrubber.value) > parseInt(scrubber.max)) {
                scrubber.value = scrubber.max;
            }
            updateGraph();
        });
    }

    const timelineScrubber = document.getElementById('timeline-scrubber');
    if (timelineScrubber) {
        timelineScrubber.addEventListener('input', updateGraph);
    }

    const animSpeed = document.getElementById('anim-speed');
    if (animSpeed) {
        animSpeed.addEventListener('input', (e) => {
            document.getElementById('anim-speed-val').innerText = e.target.value;
            if (isPlaying) {
                clearInterval(animInterval);
                animInterval = setInterval(stepAnimation, parseInt(e.target.value));
            }
        });
    }

    const btnPlay = document.getElementById('anim-play');
    if (btnPlay) {
        btnPlay.addEventListener('click', () => {
            isPlaying = !isPlaying;
            btnPlay.innerText = isPlaying ? "⏸ Pause" : "▶ Play";
            if (isPlaying) {
                animInterval = setInterval(stepAnimation, parseInt(document.getElementById('anim-speed').value));
            } else {
                clearInterval(animInterval);
            }
        });
    }

    const btnPrev = document.getElementById('anim-prev');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            const scrubber = document.getElementById('timeline-scrubber');
            scrubber.value = Math.max(0, parseInt(scrubber.value) - 1);
            updateGraph();
        });
    }

    const btnNext = document.getElementById('anim-next');
    if (btnNext) {
        btnNext.addEventListener('click', stepAnimation);
    }

    const btnJumpDate = document.getElementById('btn-jump-date');
    if (btnJumpDate) {
        btnJumpDate.addEventListener('click', () => {
            const targetDate = document.getElementById('jump-to-date').value;
            if (!targetDate || uniqueDates.length === 0) return;
            
            let closestIdx = 0;
            let minDiff = Infinity;
            const targetTime = new Date(targetDate).getTime();
            
            for (let i = 0; i < uniqueDates.length; i++) {
                const diff = Math.abs(new Date(uniqueDates[i]).getTime() - targetTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = i;
                }
            }
            
            const scrubber = document.getElementById('timeline-scrubber');
            scrubber.value = Math.min(closestIdx, parseInt(scrubber.max));
            updateGraph();
        });
    }

    const presetTimeline = document.getElementById('preset-timeline');
    if (presetTimeline) {
        presetTimeline.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) {
                const [start, end] = val.split('|');
                document.getElementById('start-date').value = start;
                document.getElementById('end-date').value = end;
                updateGraph();
            }
        });
    }

    ['start-date', 'end-date', 'segue-only', 'graph-mode'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateGraph);
    });

    const songSearch = document.getElementById('song-search');
    if (songSearch) {
        songSearch.addEventListener('input', () => {
            const searchTerm = songSearch.value.toLowerCase();
            if (!searchTerm) {
                clearSelection();
                return;
            }
            const match = graphData.nodes.find(n => n.title.toLowerCase() === searchTerm);
            if (match) {
                showStats(match);
            } else {
                highlightNode();
            }
        });
    }

    const clearSearch = document.getElementById('clear-search');
    if (clearSearch) {
        clearSearch.addEventListener('click', () => {
            document.getElementById('song-search').value = '';
            clearSelection();
        });
    }

    const colorMapping = document.getElementById('color-mapping');
    if (colorMapping) {
        colorMapping.addEventListener('change', updateNodeColors);
    }

    const nodeRepulsion = document.getElementById('node-repulsion');
    const repulsionVal = document.getElementById('repulsion-val');
    if (nodeRepulsion) {
        nodeRepulsion.addEventListener('input', (e) => {
            repulsionStrength = -parseInt(e.target.value);
            if (repulsionVal) repulsionVal.textContent = e.target.value;
            if (simulation) {
                simulation.force("charge").strength(d => d.type === 'special' ? repulsionStrength * 8 : repulsionStrength);
                simulation.alpha(0.3).restart();
            }
        });
    }

    const linkDistanceInput = document.getElementById('link-distance');
    const distanceVal = document.getElementById('distance-val');
    if (linkDistanceInput) {
        linkDistanceInput.addEventListener('input', (e) => {
            linkDistance = parseInt(e.target.value);
            if (distanceVal) distanceVal.textContent = linkDistance;
            if (simulation) {
                simulation.force("link").distance(d => d.segue ? linkDistance * 0.3 : linkDistance);
                simulation.alpha(0.3).restart();
            }
        });
    }

    const walkSpeedInput = document.getElementById('walk-speed');
    const speedValDisplay = document.getElementById('speed-val');
    if (walkSpeedInput) {
        walkSpeedInput.addEventListener('input', (e) => {
            if (speedValDisplay) speedValDisplay.textContent = e.target.value;
        });
    }

    const genRandom = document.getElementById('generate-random-walk');
    if (genRandom) genRandom.addEventListener('click', () => generateSetlistWalk(false));

    const genRealistic = document.getElementById('generate-realistic-walk');
    if (genRealistic) genRealistic.addEventListener('click', () => generateSetlistWalk(true));

    // --- Comparative Analysis Listeners ---
    const deltaMode = document.getElementById('delta-mode');
    if (deltaMode) {
        deltaMode.addEventListener('change', (e) => {
            isDeltaMode = e.target.checked;
            document.getElementById('delta-controls').classList.toggle('hidden', !isDeltaMode);
            updateGraph();
        });
    }

    const baselinePreset = document.getElementById('baseline-preset');
    if (baselinePreset) {
        baselinePreset.addEventListener('change', updateGraph);
    }

    const pinNode = document.getElementById('pin-node');
    if (pinNode) {
        pinNode.addEventListener('change', () => {
            if (pinNode.checked && selectedNode) {
                simulation.alpha(0.3).restart();
            }
        });
    }
}

initEventListeners();

function stepAnimation() {
    const scrubber = document.getElementById('timeline-scrubber');
    if (!scrubber) return;
    
    let val = parseInt(scrubber.value);
    if (val >= parseInt(scrubber.max)) {
        if (isPlaying) {
            document.getElementById('anim-play').click(); // trigger pause
        }
        return;
    }
    scrubber.value = val + 1;
    updateGraph();
}

// Sidebar Resizer Logic
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('sidebar-resizer');
const mobileToggle = document.getElementById('mobile-menu-toggle');
const mobileClose = document.getElementById('sidebar-close');
let isResizing = false;

mobileToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('show');
});

if (mobileClose) {
    mobileClose.addEventListener('click', () => {
        sidebar.classList.remove('show');
    });
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('show')) {
        if (!sidebar.contains(e.target) && e.target !== mobileToggle) {
            sidebar.classList.remove('show');
        }
    }
});

resizer.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent text selection and other defaults
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.classList.add('resizing-active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // Prevent text selection during drag
});

window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    // Use Math.min/max to cap the width between 250px and 800px
    const newWidth = Math.max(250, Math.min(800, e.clientX));
    
    sidebar.style.width = `${newWidth}px`;
    
    // Trigger a resize event to notify D3/SVG to adjust if needed
    window.dispatchEvent(new Event('resize'));
});

window.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.classList.remove('resizing-active');
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    }
});

// Handle Window Resizing
window.addEventListener('resize', () => {
    const newWidth = graphContainer.clientWidth;
    const newHeight = window.innerHeight;
    
    svg.attr("width", newWidth).attr("height", newHeight);
    
    if (simulation) {
        simulation.force("center", d3.forceCenter(newWidth / 2, newHeight / 2));
        simulation.alpha(0.3).restart();
    }
});

function updateGraph() {
    const timeModeElement = document.getElementById('time-mode');
    const timeMode = timeModeElement ? timeModeElement.value : 'range';
    const segueOnly = document.getElementById('segue-only').checked;
    const graphMode = document.getElementById('graph-mode').value;
    
    container.classed('has-selection', !!selectedNode);
    document.getElementById('stats-placeholder').classList.toggle('hidden', !!selectedNode);
    document.getElementById('stats-content').classList.toggle('hidden', !selectedNode);

    // Primary View Filter (Period B)
    let edgesB = [];
    if (timeMode === 'range') {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        edgesB = rawEdges.filter(e => {
            const edgeMonth = e.date.substring(0, 7);
            if (startDate && edgeMonth < startDate) return false;
            if (endDate && edgeMonth > endDate) return false;
            if (segueOnly && !e.segue) return false;
            return true;
        });
    } else {
        const scrubberIdx = parseInt(document.getElementById('timeline-scrubber').value) || 0;
        const windowSize = parseInt(document.getElementById('window-size').value) || 100;
        
        if (uniqueDates.length > 0) {
            const startD = uniqueDates[scrubberIdx];
            const endD = uniqueDates[Math.min(scrubberIdx + windowSize - 1, uniqueDates.length - 1)];
            
            const displayEl = document.getElementById('window-date-display');
            if (displayEl) displayEl.innerText = `${startD} to ${endD}`;
            
            edgesB = rawEdges.filter(e => {
                const d = e.date.split('T')[0];
                if (d < startD || d > endD) return false;
                if (segueOnly && !e.segue) return false;
                return true;
            });
        }
    }

    currentFilteredEdges = edgesB;
    let finalEdges = edgesB;
    let baselineEdgeKeys = new Set();
    let baselineNodeIds = new Set();

    // Baseline Filter (Period A) for Delta Mode
    if (isDeltaMode) {
        const bVal = document.getElementById('baseline-preset').value;
        if (bVal) {
            const [bStart, bEnd] = bVal.split('|');
            const edgesA = rawEdges.filter(e => {
                const edgeMonth = e.date.substring(0, 7);
                if (bStart && edgeMonth < bStart) return false;
                if (bEnd && edgeMonth > bEnd) return false;
                if (segueOnly && !e.segue) return false;
                return true;
            });

            // Mark baseline presence
            edgesA.forEach(e => {
                let sId = e.source, tId = e.target;
                if (graphMode === 'detailed') {
                    if (sId !== 'START' && sId !== 'SET_BREAK' && sId !== 'ENCORE_BREAK' && sId !== 'END') sId = `${e.set_type}_${sId}`;
                    if (tId !== 'START' && tId !== 'SET_BREAK' && tId !== 'ENCORE_BREAK' && tId !== 'END') tId = `${e.set_type}_${tId}`;
                }
                baselineEdgeKeys.add(`${sId}|||${tId}`);
                baselineNodeIds.add(sId);
                baselineNodeIds.add(tId);
            });

            // Combine for Union View
            finalEdges = [...edgesB, ...edgesA];
        }
    }

    // Aggregate edges
    let edgeCounts = {};
    let nodeDegrees = {};
    let nodeSetStats = {};
    
    finalEdges.forEach(e => {
        let sId = e.source, tId = e.target;
        if (graphMode === 'detailed') {
            if (sId !== 'START' && sId !== 'SET_BREAK' && sId !== 'ENCORE_BREAK' && sId !== 'END') sId = `${e.set_type}_${sId}`;
            if (tId !== 'START' && tId !== 'SET_BREAK' && tId !== 'ENCORE_BREAK' && tId !== 'END') tId = `${e.set_type}_${tId}`;
        }

        const key = sId + "|||" + tId;
        if (!edgeCounts[key]) {
            // Check if this edge exists in the primary (Period B) set
            const inB = edgesB.some(eb => {
                let ebS = eb.source, ebT = eb.target;
                if (graphMode === 'detailed') {
                    if (ebS !== 'START' && ebS !== 'SET_BREAK' && ebS !== 'ENCORE_BREAK' && ebS !== 'END') ebS = `${eb.set_type}_${ebS}`;
                    if (ebT !== 'START' && ebT !== 'SET_BREAK' && ebT !== 'ENCORE_BREAK' && ebT !== 'END') ebT = `${eb.set_type}_${ebT}`;
                }
                return ebS === sId && ebT === tId;
            });

            edgeCounts[key] = { 
                source: sId, target: tId, weight: 0, segue: e.segue, 
                set_type: e.set_type,
                deltaStatus: isDeltaMode ? (inB ? (baselineEdgeKeys.has(key) ? 'stable' : 'added') : 'removed') : 'stable'
            };
        }
        edgeCounts[key].weight += 1;
        
        nodeDegrees[sId] = (nodeDegrees[sId] || 0) + 1;
        nodeDegrees[tId] = (nodeDegrees[tId] || 0) + 1;

        if (e.target !== 'END' && e.target !== 'SET_BREAK' && e.target !== 'ENCORE_BREAK' && e.target !== 'START') {
            let nId = graphMode === 'detailed' ? tId : e.target;
            if (!nodeSetStats[nId]) nodeSetStats[nId] = { set1: 0, set2plus: 0, posSum: 0, posCount: 0 };
            if (e.set_type === "set1") nodeSetStats[nId].set1 += 1;
            else nodeSetStats[nId].set2plus += 1;
            if (e.target_pos !== undefined) {
                nodeSetStats[nId].posSum += e.target_pos;
                nodeSetStats[nId].posCount += 1;
            }
        }
        if (e.source !== 'END' && e.source !== 'SET_BREAK' && e.source !== 'ENCORE_BREAK' && e.source !== 'START') {
            let nId = graphMode === 'detailed' ? sId : e.source;
            if (!nodeSetStats[nId]) nodeSetStats[nId] = { set1: 0, set2plus: 0, posSum: 0, posCount: 0 };
            if (e.set_type === "set1") nodeSetStats[nId].set1 += 1;
            else nodeSetStats[nId].set2plus += 1;
            if (e.source_pos !== undefined) {
                nodeSetStats[nId].posSum += e.source_pos;
                nodeSetStats[nId].posCount += 1;
            }
        }
    });

    let oldNodesMap = new Map();
    if (graphData && graphData.nodes) {
        graphData.nodes.forEach(n => oldNodesMap.set(n.id, n));
    }

    let activeNodesMap = new Map();
    const currentNodesIds = new Set(edgesB.flatMap(e => {
        let s = e.source, t = e.target;
        if (graphMode === 'detailed') {
            if (s !== 'START' && s !== 'SET_BREAK' && s !== 'ENCORE_BREAK' && s !== 'END') s = `${e.set_type}_${s}`;
            if (t !== 'START' && t !== 'SET_BREAK' && t !== 'ENCORE_BREAK' && t !== 'END') t = `${e.set_type}_${t}`;
        }
        return [s, t];
    }));
    
    Object.keys(nodeDegrees).forEach(nodeId => {
        if (nodeDegrees[nodeId] > 0 || ['START', 'SET_BREAK', 'ENCORE_BREAK', 'END'].includes(nodeId)) {
            let baseId = nodeId;
            let setType = null;
            
            if (graphMode === 'detailed' && nodeId.includes('_') && !['START', 'SET_BREAK', 'ENCORE_BREAK', 'END'].includes(nodeId)) {
                const parts = nodeId.split('_');
                setType = parts[0];
                baseId = parts.slice(1).join('_');
            }

            let rawNode = rawNodesMap.get(baseId);
            if (!rawNode) return;

            let nodeObj;
            if (oldNodesMap.has(nodeId)) {
                nodeObj = oldNodesMap.get(nodeId);
                nodeObj.degree = nodeDegrees[nodeId] || 0;
            } else {
                nodeObj = { ...rawNode, id: nodeId, baseId: baseId, setType: setType, degree: nodeDegrees[nodeId] || 0 };
                if (rawNode.type === 'special') {
                    if (nodeId === 'START') { nodeObj.x = width * -0.5; nodeObj.y = height / 2; }
                    else if (nodeId === 'SET_BREAK') { nodeObj.x = width * 0.5; nodeObj.y = height / 2; }
                    else if (nodeId === 'ENCORE_BREAK') { nodeObj.x = width * 1.5; nodeObj.y = height / 2; }
                    else if (nodeId === 'END') { nodeObj.x = width * 2.5; nodeObj.y = height / 2; }
                } else {
                    nodeObj.x = width / 2 + (Math.random() - 0.5) * 20;
                    nodeObj.y = height / 2 + (Math.random() - 0.5) * 20;
                }
            }

            nodeObj.deltaStatus = isDeltaMode ? (currentNodesIds.has(nodeId) ? (baselineNodeIds.has(nodeId) ? 'stable' : 'added') : 'removed') : 'stable';

            if (nodeObj.type !== 'special') {
                let s1 = nodeSetStats[nodeId] ? nodeSetStats[nodeId].set1 : 0;
                let s2 = nodeSetStats[nodeId] ? nodeSetStats[nodeId].set2plus : 0;
                let total = s1 + s2;
                nodeObj.set1Plays = s1;
                nodeObj.set2Plays = s2;
                nodeObj.setRatio = total > 0 ? s1 / total : 0.5;

                let pSum = nodeSetStats[nodeId] ? nodeSetStats[nodeId].posSum : 0;
                let pCount = nodeSetStats[nodeId] ? nodeSetStats[nodeId].posCount : 0;
                nodeObj.posAvg = pCount > 0 ? pSum / pCount : 0.5;

                if (!oldNodesMap.has(nodeId) && graphMode === 'detailed') {
                    if (setType === 'set1') nodeObj.title += " (Set 1)";
                    else if (setType === 'set2') nodeObj.title += " (Set 2)";
                    else if (setType === 'epilogue') nodeObj.title += " (Encore)";
                }
            }
            activeNodesMap.set(nodeId, nodeObj);
        }
    });

    let links = Object.values(edgeCounts).map(e => {
        return {
            id: e.source + "|||" + e.target,
            source: activeNodesMap.get(e.source),
            target: activeNodesMap.get(e.target),
            weight: e.weight,
            segue: e.segue,
            deltaStatus: e.deltaStatus
        };
    }).filter(e => e.source && e.target);

    graphData = {
        nodes: Array.from(activeNodesMap.values()),
        links: links
    };

    renderGraph();
}

function renderGraph() {
    // Links Join
    const links = linkGroup.selectAll("line")
        .data(graphData.links, d => d.id);

    // Faster exit for smoother scrubbing
    links.exit().transition().duration(150).style("stroke-opacity", 0).remove();

    const linksEnter = links.enter().append("line")
        .attr("class", d => d.segue ? "link segue" : "link")
        .attr("marker-end", "url(#end)")
        .style("stroke-opacity", 0);

    // Update linkElements to include ALL lines in the DOM, ensuring exiting ones stay connected during fade
    linkElements = linkGroup.selectAll("line");
    
    linksEnter.merge(links).transition().duration(isPlaying ? 100 : 300)
        .attr("stroke-width", d => Math.sqrt(d.weight) + 0.5)
        .style("stroke-opacity", d => d.segue ? 0.8 : 0.6)
        .style("stroke", d => {
            if (isDeltaMode) {
                if (d.deltaStatus === 'added') return "#2ecc71";
                if (d.deltaStatus === 'removed') return "#e74c3c";
            }
            return null;
        });

    // Nodes Join
    const nodes = nodeGroup.selectAll("circle")
        .data(graphData.nodes, d => d.id);

    nodes.exit().transition().duration(150).attr("r", 0).remove();

    const nodesEnter = nodes.enter().append("circle")
        .attr("class", d => d.type === 'special' ? 'node node-special' : 'node node-song')
        .attr("id", d => `node-${d.id.replace(/[^a-zA-Z0-9]/g, '_')}`)
        .attr("r", 0)
        .call(d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended))
        .on("click", (event, d) => {
            event.stopPropagation();
            showStats(d);
        });

    nodesEnter.append("title");

    // Update nodeElements to include ALL circles in the DOM
    nodeElements = nodeGroup.selectAll("circle");
    
    nodesEnter.merge(nodes).select("title").text(d => d.title + " (" + d.degree + " plays)");

    nodesEnter.merge(nodes).transition().duration(isPlaying ? 100 : 300)
        .attr("r", d => d.type === 'special' ? 12 : Math.max(3, Math.min(15, Math.sqrt(d.degree))));

    updateNodeColors();

    // Labels Join
    const labels = labelGroup.selectAll("text")
        .data(graphData.nodes, d => d.id);

    labels.exit().transition().duration(150).style("opacity", 0).remove();

    const labelsEnter = labels.enter().append("text")
        .attr("class", d => d.type === 'special' ? 'special-label' : 'node-label')
        .attr("id", d => `label-${d.id.replace(/[^a-zA-Z0-9]/g, '_')}`)
        .attr("dx", 12)
        .attr("dy", ".35em")
        .style("opacity", 0);

    // Update labelElements to include ALL text in the DOM
    labelElements = labelGroup.selectAll("text");
    
    labelsEnter.merge(labels).text(d => d.type === 'special' ? d.title : (d.degree > 100 ? d.title : ""))
        .transition().duration(isPlaying ? 100 : 300)
        .style("opacity", 1);

    // Simulation Update
    if (!simulation) {
        simulation = d3.forceSimulation(graphData.nodes)
            .force("link", d3.forceLink(graphData.links).id(d => d.id).distance(d => d.segue ? linkDistance * 0.3 : linkDistance))
            .force("charge", d3.forceManyBody().strength(d => d.type === 'special' ? repulsionStrength * 8 : repulsionStrength))
            .force("x", d3.forceX(d => {
                if (d.id === 'START') return width * -0.5;
                if (d.id === 'SET_BREAK') return width * 0.5;
                if (d.id === 'ENCORE_BREAK') return width * 1.5;
                if (d.id === 'END') return width * 2.5;
                return width / 2;
            }).strength(d => d.type === 'special' ? 0.3 : 0))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius(d => d.type === 'special' ? 15 : Math.sqrt(d.degree) + 2))
            .on("tick", ticked);
    } else {
        simulation.nodes(graphData.nodes);
        simulation.force("link").links(graphData.links);
        simulation.alpha(0.3).restart();
    }
}

function updateNodeColors() {
    const colorModeEl = document.getElementById('color-mapping');
    const colorMode = colorModeEl ? colorModeEl.value : 'set-probability';
    const graphModeEl = document.getElementById('graph-mode');
    const graphMode = graphModeEl ? graphModeEl.value : 'detailed';
    
    const r1=255, g1=77, b1=77;
    const r2=77, g2=166, b2=255;

    nodeElements.style("fill", d => {
        if (!d) return null;
        if (isDeltaMode) {
            if (d.deltaStatus === 'added') return "#2ecc71";
            if (d.deltaStatus === 'removed') return "#e74c3c";
        }
        if (colorMode === 'set-probability') {
            if (d.type === 'special') {
                if (d.id === 'START') return `rgb(${r1},${g1},${b1})`; 
                if (d.id === 'SET_BREAK') return `rgb(166, 121, 166)`; 
                if (d.id === 'ENCORE_BREAK') return `rgb(100, 140, 200)`; 
                if (d.id === 'END') return `rgb(${r2},${g2},${b2})`; 
            } else {
                let ratio = d.setRatio; 
                if (graphMode === 'detailed') {
                    ratio = 1.0 - d.posAvg;
                }
                const r = Math.round(r1 * ratio + r2 * (1 - ratio));
                const g = Math.round(g1 * ratio + g2 * (1 - ratio));
                const b = Math.round(b1 * ratio + b2 * (1 - ratio));
                return `rgb(${r},${g},${b})`;
            }
        }
        return null; 
    }).style("stroke", d => {
        if (d && isDeltaMode) {
            if (d.deltaStatus === 'added') return "#27ae60";
            if (d.deltaStatus === 'removed') return "#c0392b";
        }
        return null;
    });
}

function ticked() {
    linkElements
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    nodeElements
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

    labelElements
        .attr("x", d => d.x)
        .attr("y", d => d.y);

    // Camera Tracking (Pinning)
    const pinCheckbox = document.getElementById('pin-node');
    if (pinCheckbox && pinCheckbox.checked && selectedNode) {
        // Optimized: only calculate transform if needed
        const t = d3.zoomTransform(svg.node());
        const newTx = (width / 2) - t.k * selectedNode.x;
        const newTy = (height / 2) - t.k * selectedNode.y;
        svg.call(zoom.transform, d3.zoomIdentity.translate(newTx, newTy).scale(t.k));
    }
}

function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    if (d.type !== 'special') {
        d.fx = d.x;
        d.fy = d.y;
    }
}

function dragged(event, d) {
    if (d.type !== 'special') {
        d.fx = event.x;
        d.fy = event.y;
    }
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    if (d.type !== 'special') {
        d.fx = null;
        d.fy = null;
    }
}

function clearSelection() {
    selectedNode = null;
    const pinNode = document.getElementById('pin-node');
    if (pinNode) pinNode.checked = false;
    
    document.getElementById('stats-placeholder').classList.remove('hidden');
    document.getElementById('stats-content').classList.add('hidden');
    
    container.classed('has-selection', false);
    
    nodeElements.classed('selected', false).classed('connected', false);
    linkElements.classed('connected', false).classed('walk-active', false).style("stroke", null);
    labelElements.classed('connected', false).text(d => d.type === 'special' ? d.title : (d.degree > 100 ? d.title : ""));

    container.selectAll(".walker").remove();
}

function showStats(nodeData) {
    if (selectedNode && selectedNode.id === nodeData.id) {
        clearSelection();
        return;
    }

    selectedNode = nodeData;
    
    document.getElementById('stats-placeholder').classList.add('hidden');
    document.getElementById('stats-content').classList.remove('hidden');

    document.getElementById('stat-title').innerText = nodeData.title;
    document.getElementById('stat-plays').innerText = nodeData.degree;
    
    if (nodeData.type !== 'special') {
        const s1pct = Math.round(nodeData.setRatio * 100);
        document.getElementById('stat-set-breakdown').innerText = `Overall Set 1: ${s1pct}% | Set 2+: ${100 - s1pct}%`;
    } else {
        document.getElementById('stat-set-breakdown').innerText = "";
    }

    let incoming = [];
    let outgoing = [];
    let connectedNodeIds = new Set([nodeData.id]); 
    
    graphData.links.forEach(l => {
        if (l.target.id === nodeData.id) {
            incoming.push({ title: l.source.title, weight: l.weight, source: l.source, target: l.target });
            connectedNodeIds.add(l.source.id);
        } else if (l.source.id === nodeData.id) {
            outgoing.push({ title: l.target.title, weight: l.weight, source: l.source, target: l.target });
            connectedNodeIds.add(l.target.id);
        }
    });

    container.classed('has-selection', true); 
    
    nodeElements.classed('selected', false).classed('connected', false);
    linkElements.classed('connected', false).classed('walk-active', false);
    labelElements.classed('connected', false);
    container.selectAll(".walker").remove();

    nodeElements.filter(d => connectedNodeIds.has(d.id))
        .classed('connected', true)
        .classed('selected', d => d.id === nodeData.id);
        
    linkElements.filter(l => l.source.id === nodeData.id || l.target.id === nodeData.id)
        .classed('connected', true);
        
    labelElements.filter(d => connectedNodeIds.has(d.id))
        .classed('connected', true)
        .text(d => d.title); 

    incoming.sort((a, b) => b.weight - a.weight);
    outgoing.sort((a, b) => b.weight - a.weight);

    const prevList = document.getElementById('stat-prev');
    prevList.innerHTML = '';
    incoming.slice(0, 10).forEach(i => {
        const li = document.createElement('li');
        li.classList.add('transition-item');
        li.innerHTML = `<span>← ${i.title} (${i.weight}x)</span><div class="date-list hidden"></div>`;
        li.onclick = (e) => {
            e.stopPropagation();
            toggleTransitionDates(li, i.source, i.target);
        };
        prevList.appendChild(li);
    });

    const nextList = document.getElementById('stat-next');
    nextList.innerHTML = '';
    outgoing.slice(0, 10).forEach(o => {
        const li = document.createElement('li');
        li.classList.add('transition-item');
        li.innerHTML = `<span>${o.title} (${o.weight}x) →</span><div class="date-list hidden"></div>`;
        li.onclick = (e) => {
            e.stopPropagation();
            toggleTransitionDates(li, o.source, o.target);
        };
        nextList.appendChild(li);
    });
}

function toggleTransitionDates(li, sourceNode, targetNode) {
    const dateListDiv = li.querySelector('.date-list');
    if (!dateListDiv.classList.contains('hidden')) {
        dateListDiv.classList.add('hidden');
        return;
    }

    const matches = currentFilteredEdges.filter(e => {
        if (sourceNode.setType || targetNode.setType) {
            const sMatch = (sourceNode.type === 'special' ? e.source === sourceNode.id : (e.source === sourceNode.baseId && e.set_type === sourceNode.setType));
            const tMatch = (targetNode.type === 'special' ? e.target === targetNode.id : (e.target === targetNode.baseId && e.set_type === targetNode.setType));
            return sMatch && tMatch;
        }
        return e.source === sourceNode.id && e.target === targetNode.id;
    });

    matches.sort((a, b) => a.date.localeCompare(b.date));

    if (matches.length === 0) {
        dateListDiv.innerHTML = "<div>No data found</div>";
    } else {
        dateListDiv.innerHTML = matches.map(m => `<div>${m.date.split('T')[0]}</div>`).join('');
    }
    dateListDiv.classList.remove('hidden');
}

function highlightNode() {
    const searchTerm = document.getElementById('song-search').value.toLowerCase();
    if (!searchTerm) {
        clearSelection();
        return;
    }

    container.classed('has-selection', true);
    nodeElements.classed('selected', false).classed('connected', false);
    linkElements.classed('connected', false);
    labelElements.classed('connected', false);

    const matches = new Set();
    nodeElements.filter(d => {
        if (!d || d.type === 'special') return false;
        const isMatch = d.title.toLowerCase().includes(searchTerm);
        if (isMatch) matches.add(d.id);
        return isMatch;
    }).classed('selected', true);
    
    labelElements.filter(d => d && matches.has(d.id))
        .classed('selected', true)
        .text(d => d.title);
}

// Markov Chain Generator
async function generateSetlistWalk(enforceRealisticRules = false) {
    const walkDuration = parseInt(document.getElementById('walk-speed').value) || 800;
    const outputEl = document.getElementById('generated-setlist-output');
    if (outputEl) outputEl.classList.remove('hidden');
    const ul = document.getElementById('generated-list');
    if (ul) ul.innerHTML = '';
    
    clearSelection();
    container.classed('has-selection', true);

    const startNode = graphData.nodes.find(n => n.id === 'START');
    if (!startNode) return;

    let currentNode = startNode;
    let maxSteps = 50;
    
    let currentSet = 1;
    let songsInCurrentSet = 0;
    const epilogueCheck = document.getElementById('include-epilogue');
    const includeEpilogue = epilogueCheck ? epilogueCheck.checked : true;
    
    const walkerColor = enforceRealisticRules ? "#ff8c00" : "#00ffcc";
    const walker = container.append("circle")
        .attr("class", "walker")
        .attr("r", 8)
        .attr("fill", walkerColor)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
        .attr("cx", currentNode.x)
        .attr("cy", currentNode.y)
        .style("filter", `drop-shadow(0 0 5px ${walkerColor})`);

    while (currentNode.id !== 'END' && maxSteps > 0) {
        let options = graphData.links.filter(l => l.source.id === currentNode.id);
        
        if (enforceRealisticRules) {
            options = options.filter(l => {
                const targetId = l.target.id;
                const targetTitle = l.target.title ? l.target.title.toLowerCase() : "";
                
                if (currentSet === 1 && (targetTitle.includes('drums') || targetTitle.includes('space'))) {
                    return false;
                }
                
                if ((targetId === 'SET_BREAK' || targetId === 'ENCORE_BREAK' || targetId === 'END') && songsInCurrentSet < 4) {
                    return false;
                }
                
                if (currentSet >= 2 && targetId === 'SET_BREAK') {
                    return false;
                }

                if (!includeEpilogue && targetId === 'ENCORE_BREAK') {
                    return false;
                }

                return true;
            });
            
            if (options.length === 0) {
                 options = graphData.links.filter(l => l.source.id === currentNode.id);
            }
        }
        
        if (options.length === 0) break;

        const totalWeight = options.reduce((sum, l) => sum + l.weight, 0);
        
        let rand = Math.random() * totalWeight;
        let selectedLink = options[0];
        
        for (let l of options) {
            rand -= l.weight;
            if (rand <= 0) {
                selectedLink = l;
                break;
            }
        }

        const nextNode = selectedLink.target;
        
        if (nextNode.id === 'SET_BREAK' || nextNode.id === 'ENCORE_BREAK') {
            currentSet++;
            songsInCurrentSet = 0;
        } else if (nextNode.id !== 'END' && nextNode.id !== 'START') {
            songsInCurrentSet++;
        }
        
        await new Promise(resolve => {
            const transform = d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(1)
                .translate(-nextNode.x, -nextNode.y);

            svg.transition()
                .duration(walkDuration)
                .ease(d3.easeCubicInOut)
                .call(zoom.transform, transform);

            walker.transition()
                .duration(walkDuration)
                .ease(d3.easeCubicInOut)
                .attr("cx", nextNode.x)
                .attr("cy", nextNode.y)
                .on("end", resolve);
        });

        if (nextNode.type !== 'special') {
            const li = document.createElement('li');
            li.innerText = nextNode.title.replace(' (Set 1)', '').replace(' (Set 2)', '').replace(' (Encore)', '');
            if (selectedLink.segue) li.innerText += " ->";
            if (ul) {
                ul.appendChild(li);
                ul.parentElement.scrollTop = ul.parentElement.scrollHeight;
            }
        } else if (nextNode.id === 'SET_BREAK') {
            const li = document.createElement('li');
            li.innerHTML = "<em>-- Set Break --</em>";
            li.style.color = "var(--accent-color)";
            if (ul) ul.appendChild(li);
        } else if (nextNode.id === 'ENCORE_BREAK') {
            const li = document.createElement('li');
            li.innerHTML = "<em>-- Encore --</em>";
            li.style.color = "var(--accent-color)";
            if (ul) ul.appendChild(li);
        }

        nodeElements.filter(d => d && (d.id === currentNode.id || d.id === nextNode.id)).classed('connected', true);
        labelElements.filter(d => d && (d.id === currentNode.id || d.id === nextNode.id)).classed('connected', true).text(d => d.title);
        
        linkElements.filter(l => l === selectedLink)
            .classed('walk-active', true)
            .classed('connected', true)
            .style("stroke", walkerColor);

        currentNode = nextNode;
        maxSteps--;
    }
    
    walker.transition()
        .duration(500)
        .attr("r", 30)
        .style("opacity", 0)
        .remove();
}

