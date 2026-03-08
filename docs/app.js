let rawNodes = [];
let rawEdges = [];
let graphData = { nodes: [], links: [] };

let simulation;
let svg, container;
let nodeElements, linkElements, labelElements;
let selectedNode = null; // Track currently selected node

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

// Initialize random 1-year timeframe to prevent initial lag
const randomYear = Math.floor(Math.random() * (1995 - 1965 + 1)) + 1965;
document.getElementById('start-date').value = `${randomYear}-01`;
document.getElementById('end-date').value = `${randomYear}-12`;

// Load data
d3.json("data/graph_data.json").then(data => {
    rawNodes = data.nodes;
    rawEdges = data.edges;

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

// Event Listeners
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    document.getElementById('theme-toggle').innerText = isLight ? '🌙' : '☀️';
});

document.getElementById('preset-timeline').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
        const [start, end] = val.split('|');
        document.getElementById('start-date').value = start;
        document.getElementById('end-date').value = end;
        updateGraph();
    }
});

document.getElementById('start-date').addEventListener('change', updateGraph);
document.getElementById('end-date').addEventListener('change', updateGraph);
document.getElementById('segue-only').addEventListener('change', updateGraph);

document.getElementById('song-search').addEventListener('input', () => {
    const searchTerm = document.getElementById('song-search').value.toLowerCase();
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

document.getElementById('clear-search').addEventListener('click', () => {
    document.getElementById('song-search').value = '';
    clearSelection();
});

// Controls Listeners
document.getElementById('color-mapping').addEventListener('change', updateNodeColors);

document.getElementById('node-repulsion').addEventListener('input', (e) => {
    repulsionStrength = -parseInt(e.target.value);
    document.getElementById('repulsion-val').innerText = e.target.value;
    if (simulation) {
        simulation.force("charge").strength(repulsionStrength);
        simulation.alpha(0.3).restart();
    }
});

document.getElementById('link-distance').addEventListener('input', (e) => {
    linkDistance = parseInt(e.target.value);
    document.getElementById('distance-val').innerText = linkDistance;
    if (simulation) {
        simulation.force("link").distance(d => d.segue ? linkDistance * 0.3 : linkDistance);
        simulation.alpha(0.3).restart();
    }
});

document.getElementById('generate-setlist').addEventListener('click', generateSetlistWalk);

function updateGraph() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const segueOnly = document.getElementById('segue-only').checked;
    
    selectedNode = null;
    container.classed('has-selection', false);
    document.getElementById('stats-placeholder').classList.remove('hidden');
    document.getElementById('stats-content').classList.add('hidden');

    // Filter edges based on date and segue
    let filteredEdges = rawEdges.filter(e => {
        const edgeMonth = e.date.substring(0, 7);
        if (startDate && edgeMonth < startDate) return false;
        if (endDate && edgeMonth > endDate) return false;
        if (segueOnly && !e.segue) return false;
        return true;
    });

    // Aggregate edges to get weights
    let edgeCounts = {};
    let nodeDegrees = {};
    let nodeSetStats = {};
    
    filteredEdges.forEach(e => {
        const key = e.source + "|||" + e.target;
        if (!edgeCounts[key]) {
            edgeCounts[key] = { source: e.source, target: e.target, weight: 0, segue: e.segue };
        }
        edgeCounts[key].weight += 1;
        
        nodeDegrees[e.source] = (nodeDegrees[e.source] || 0) + 1;
        nodeDegrees[e.target] = (nodeDegrees[e.target] || 0) + 1;

        // Track Set Info
        if (e.target !== 'END' && e.target !== 'SET_BREAK' && e.target !== 'START') {
            if (!nodeSetStats[e.target]) nodeSetStats[e.target] = { set1: 0, set2plus: 0 };
            if (e.set === 1) nodeSetStats[e.target].set1 += 1;
            else nodeSetStats[e.target].set2plus += 1;
        }
        if (e.source !== 'END' && e.source !== 'SET_BREAK' && e.source !== 'START') {
            if (!nodeSetStats[e.source]) nodeSetStats[e.source] = { set1: 0, set2plus: 0 };
            if (e.set === 1) nodeSetStats[e.source].set1 += 1;
            else nodeSetStats[e.source].set2plus += 1;
        }
    });

    // We only want nodes that are active in this timeframe (degree > 0), plus our special nodes
    let activeNodesMap = new Map();
    
    rawNodes.forEach(n => {
        if (nodeDegrees[n.id] > 0 || n.type === 'special') {
            let nodeObj = { ...n, degree: nodeDegrees[n.id] || 0 };
            
            // Set probability calc
            let s1 = nodeSetStats[n.id] ? nodeSetStats[n.id].set1 : 0;
            let s2 = nodeSetStats[n.id] ? nodeSetStats[n.id].set2plus : 0;
            let total = s1 + s2;
            nodeObj.set1Plays = s1;
            nodeObj.set2Plays = s2;
            nodeObj.setRatio = total > 0 ? s1 / total : 0.5; // 1 = only set 1, 0 = only set 2+

            // Fix positions of special nodes
            if (n.id === 'START') {
                nodeObj.fx = width * 0.1;
                nodeObj.fy = height / 2;
            } else if (n.id === 'SET_BREAK') {
                nodeObj.fx = width * 0.5;
                nodeObj.fy = height / 2;
            } else if (n.id === 'END') {
                nodeObj.fx = width * 0.9;
                nodeObj.fy = height / 2;
            }
            
            activeNodesMap.set(n.id, nodeObj);
        }
    });

    let links = Object.values(edgeCounts).map(e => {
        return {
            source: activeNodesMap.get(e.source),
            target: activeNodesMap.get(e.target),
            weight: e.weight,
            segue: e.segue
        };
    }).filter(e => e.source && e.target);

    graphData = {
        nodes: Array.from(activeNodesMap.values()),
        links: links
    };

    renderGraph();
}

function renderGraph() {
    container.selectAll("*").remove();

    // Arrows
    container.append("defs").selectAll("marker")
        .data(["end"])
        .enter().append("marker")
        .attr("id", String)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 15)
        .attr("refY", -0.5)
        .attr("markerWidth", 4)
        .attr("markerHeight", 4)
        .attr("orient", "auto")
        .append("path")
        .attr("fill", "var(--link-color)")
        .attr("d", "M0,-5L10,0L0,5");

    linkElements = container.append("g")
        .selectAll("line")
        .data(graphData.links)
        .enter().append("line")
        .attr("class", d => d.segue ? "link segue" : "link")
        .attr("stroke-width", d => Math.sqrt(d.weight) + 0.5)
        .attr("marker-end", "url(#end)");

    nodeElements = container.append("g")
        .selectAll("circle")
        .data(graphData.nodes)
        .enter().append("circle")
        .attr("class", d => d.type === 'special' ? 'node node-special' : 'node node-song')
        .attr("id", d => `node-${d.id.replace(/[^a-zA-Z0-9]/g, '_')}`)
        .attr("r", d => d.type === 'special' ? 12 : Math.max(3, Math.min(15, Math.sqrt(d.degree))))
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .on("click", (event, d) => {
            event.stopPropagation();
            showStats(d);
        });

    labelElements = container.append("g")
        .selectAll("text")
        .data(graphData.nodes)
        .enter().append("text")
        .attr("class", d => d.type === 'special' ? 'special-label' : 'node-label')
        .attr("id", d => `label-${d.id.replace(/[^a-zA-Z0-9]/g, '_')}`)
        .text(d => d.type === 'special' ? d.title : (d.degree > 100 ? d.title : ""))
        .attr("dx", 12)
        .attr("dy", ".35em");

    nodeElements.append("title")
        .text(d => d.title + " (" + d.degree + " plays)");

    updateNodeColors();

    if (simulation) simulation.stop();

    simulation = d3.forceSimulation(graphData.nodes)
        .force("link", d3.forceLink(graphData.links).distance(d => d.segue ? linkDistance * 0.3 : linkDistance))
        .force("charge", d3.forceManyBody().strength(repulsionStrength))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => d.type === 'special' ? 15 : Math.sqrt(d.degree) + 2))
        .on("tick", ticked);
}

function updateNodeColors() {
    const colorMode = document.getElementById('color-mapping').value;
    
    // Set 1 = Red, Set 2 = Blue
    const r1=255, g1=77, b1=77;
    const r2=77, g2=166, b2=255;

    nodeElements.style("fill", d => {
        if (d.type === 'special') return null; // Use CSS variables
        
        if (colorMode === 'set-probability') {
            const ratio = d.setRatio;
            const r = Math.round(r1 * ratio + r2 * (1 - ratio));
            const g = Math.round(g1 * ratio + g2 * (1 - ratio));
            const b = Math.round(b1 * ratio + b2 * (1 - ratio));
            return `rgb(${r},${g},${b})`;
        }
        
        return null; // Removes inline style, falling back to CSS variables
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
    document.getElementById('stats-placeholder').classList.remove('hidden');
    document.getElementById('stats-content').classList.add('hidden');
    
    container.classed('has-selection', false);
    
    nodeElements.classed('selected', false).classed('connected', false);
    linkElements.classed('connected', false).classed('walk-active', false);
    labelElements.classed('connected', false).text(d => d.type === 'special' ? d.title : (d.degree > 100 ? d.title : ""));

    // Remove any walk elements
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
        document.getElementById('stat-set-breakdown').innerText = `Set 1: ${s1pct}% | Set 2+: ${100 - s1pct}%`;
    } else {
        document.getElementById('stat-set-breakdown').innerText = "";
    }

    let incoming = [];
    let outgoing = [];
    let connectedNodeIds = new Set([nodeData.id]); 
    
    graphData.links.forEach(l => {
        if (l.target.id === nodeData.id) {
            incoming.push({ title: l.source.title, weight: l.weight });
            connectedNodeIds.add(l.source.id);
        } else if (l.source.id === nodeData.id) {
            outgoing.push({ title: l.target.title, weight: l.weight });
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
    incoming.slice(0, 5).forEach(i => {
        const li = document.createElement('li');
        li.innerText = `${i.title} (${i.weight} times)`;
        prevList.appendChild(li);
    });

    const nextList = document.getElementById('stat-next');
    nextList.innerHTML = '';
    outgoing.slice(0, 5).forEach(o => {
        const li = document.createElement('li');
        li.innerText = `${o.title} (${o.weight} times)`;
        nextList.appendChild(li);
    });
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
        if (d.type === 'special') return false;
        const isMatch = d.title.toLowerCase().includes(searchTerm);
        if (isMatch) matches.add(d.id);
        return isMatch;
    }).classed('selected', true);
    
    labelElements.filter(d => matches.has(d.id))
        .classed('selected', true)
        .text(d => d.title);
}

// Markov Chain Generator
async function generateSetlistWalk() {
    document.getElementById('generated-setlist-output').classList.remove('hidden');
    const ul = document.getElementById('generated-list');
    ul.innerHTML = ''; // clear previous
    
    // Highlight modes
    clearSelection();
    container.classed('has-selection', true);

    const startNode = graphData.nodes.find(n => n.id === 'START');
    if (!startNode) return;

    let currentNode = startNode;
    let walkNodes = new Set([currentNode.id]);
    let maxSteps = 40;
    
    // Create the "walker" dot
    const walker = container.append("circle")
        .attr("class", "walker")
        .attr("r", 8)
        .attr("fill", "#00ffcc")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
        .attr("cx", currentNode.x)
        .attr("cy", currentNode.y)
        .style("filter", "drop-shadow(0 0 5px #00ffcc)");

    while (currentNode.id !== 'END' && maxSteps > 0) {
        // Find possible outgoing links
        const options = graphData.links.filter(l => l.source.id === currentNode.id);
        if (options.length === 0) break; // Dead end

        // Calculate total weight
        const totalWeight = options.reduce((sum, l) => sum + l.weight, 0);
        
        // Random selection based on weight
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
        
        // Animate walker to next node
        await new Promise(resolve => {
            walker.transition()
                .duration(800)
                .ease(d3.easeCubicInOut)
                .attr("cx", nextNode.x)
                .attr("cy", nextNode.y)
                .on("end", resolve);
        });

        // Add to UI List
        if (nextNode.type !== 'special') {
            const li = document.createElement('li');
            li.innerText = nextNode.title;
            if (selectedLink.segue) li.innerText += " ->";
            ul.appendChild(li);
            // Scroll to bottom
            ul.parentElement.scrollTop = ul.parentElement.scrollHeight;
        } else if (nextNode.id === 'SET_BREAK') {
            const li = document.createElement('li');
            li.innerHTML = "<em>-- Set Break --</em>";
            li.style.color = "var(--accent-color)";
            ul.appendChild(li);
        }

        // Highlight the path permanently for this run
        nodeElements.filter(d => d.id === currentNode.id || d.id === nextNode.id).classed('connected', true);
        labelElements.filter(d => d.id === currentNode.id || d.id === nextNode.id).classed('connected', true).text(d => d.title);
        linkElements.filter(l => l === selectedLink).classed('walk-active', true).classed('connected', true);

        currentNode = nextNode;
        maxSteps--;
    }
    
    // Walker explodes at the end
    walker.transition()
        .duration(500)
        .attr("r", 30)
        .style("opacity", 0)
        .remove();
}
