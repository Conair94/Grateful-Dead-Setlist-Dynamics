let rawNodes = [];
let rawEdges = [];
let graphData = { nodes: [], links: [] };

let simulation;
let svg, container;
let nodeElements, linkElements, labelElements;
let selectedNode = null; // Track currently selected node

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
    
    // Find the exact node if possible
    const match = graphData.nodes.find(n => n.title.toLowerCase() === searchTerm);
    if (match) {
        showStats(match);
    } else {
        highlightNode(); // Fallback to partial highlighting
    }
});
document.getElementById('clear-search').addEventListener('click', () => {
    document.getElementById('song-search').value = '';
    clearSelection();
});

function updateGraph() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const segueOnly = document.getElementById('segue-only').checked;
    
    selectedNode = null; // Clear selection on data change

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
    
    filteredEdges.forEach(e => {
        const key = e.source + "|||" + e.target;
        if (!edgeCounts[key]) {
            edgeCounts[key] = { source: e.source, target: e.target, weight: 0, segue: e.segue };
        }
        edgeCounts[key].weight += 1;
        
        nodeDegrees[e.source] = (nodeDegrees[e.source] || 0) + 1;
        nodeDegrees[e.target] = (nodeDegrees[e.target] || 0) + 1;
    });

    // We only want nodes that are active in this timeframe (degree > 0), plus our special nodes
    let activeNodesMap = new Map();
    
    rawNodes.forEach(n => {
        if (nodeDegrees[n.id] > 0 || n.type === 'special') {
            // Create a copy for the simulation
            let nodeObj = { ...n, degree: nodeDegrees[n.id] || 0 };
            
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

    // Re-map edges to object references required by D3
    let links = Object.values(edgeCounts).map(e => {
        return {
            source: activeNodesMap.get(e.source),
            target: activeNodesMap.get(e.target),
            weight: e.weight,
            segue: e.segue
        };
    }).filter(e => e.source && e.target); // Safety check

    graphData = {
        nodes: Array.from(activeNodesMap.values()),
        links: links
    };

    renderGraph();
}

function renderGraph() {
    container.selectAll("*").remove();

    // Arrows for directed graph
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
        .attr("fill", "#555")
        .attr("d", "M0,-5L10,0L0,5");

    // Edges
    linkElements = container.append("g")
        .selectAll("line")
        .data(graphData.links)
        .enter().append("line")
        .attr("class", d => d.segue ? "link segue" : "link")
        .attr("stroke-width", d => Math.sqrt(d.weight) + 0.5)
        .attr("marker-end", "url(#end)");

    // Nodes
    nodeElements = container.append("g")
        .selectAll("circle")
        .data(graphData.nodes)
        .enter().append("circle")
        .attr("class", d => d.type === 'special' ? 'node node-special' : 'node node-song')
        .attr("r", d => d.type === 'special' ? 12 : Math.max(3, Math.min(15, Math.sqrt(d.degree))))
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .on("click", (event, d) => {
            event.stopPropagation(); // Prevent SVG click from firing
            showStats(d);
        });

    // Labels for special nodes and large nodes
    labelElements = container.append("g")
        .selectAll("text")
        .data(graphData.nodes)
        .enter().append("text")
        .attr("class", d => d.type === 'special' ? 'special-label' : 'node-label')
        .text(d => d.type === 'special' ? d.title : (d.degree > 100 ? d.title : ""))
        .attr("dx", 12)
        .attr("dy", ".35em");

    // Node Tooltips
    nodeElements.append("title")
        .text(d => d.title + " (" + d.degree + " plays in selection)");

    // Simulation Setup
    if (simulation) simulation.stop();

    simulation = d3.forceSimulation(graphData.nodes)
        .force("link", d3.forceLink(graphData.links).distance(d => d.segue ? 20 : 60))
        .force("charge", d3.forceManyBody().strength(-150))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => d.type === 'special' ? 15 : Math.sqrt(d.degree) + 2))
        .on("tick", ticked);
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
    
    // Reset visual styles
    nodeElements.style("opacity", 1)
        .attr("stroke", d => d.type === 'special' ? "#fff" : "#222")
        .attr("stroke-width", d => d.type === 'special' ? 2 : 1);
        
    linkElements.style("opacity", d => d.segue ? 0.8 : 0.6)
        .attr("stroke", d => d.segue ? "#ffbb33" : "#555")
        .attr("stroke-width", d => Math.sqrt(d.weight) + 0.5);
        
    labelElements.style("opacity", 1)
        .text(d => d.type === 'special' ? d.title : (d.degree > 100 ? d.title : ""))
        .attr("fill", d => d.type === 'special' ? "#fff" : "#ccc");
}

function showStats(nodeData) {
    selectedNode = nodeData;
    
    document.getElementById('stats-placeholder').classList.add('hidden');
    document.getElementById('stats-content').classList.remove('hidden');

    document.getElementById('stat-title').innerText = nodeData.title;
    document.getElementById('stat-plays').innerText = nodeData.degree;

    // Find predecessors and successors
    let incoming = [];
    let outgoing = [];
    let connectedNodeIds = new Set([nodeData.id]); // Store connected node IDs for highlighting

    graphData.links.forEach(l => {
        if (l.target.id === nodeData.id) {
            incoming.push({ title: l.source.title, weight: l.weight });
            connectedNodeIds.add(l.source.id);
        }
        if (l.source.id === nodeData.id) {
            outgoing.push({ title: l.target.title, weight: l.weight });
            connectedNodeIds.add(l.target.id);
        }
    });

    // Update Network Visuals for Path Tracing
    nodeElements
        .style("opacity", d => connectedNodeIds.has(d.id) ? 1 : 0.1)
        .attr("stroke", d => d.id === nodeData.id ? "#fff" : (connectedNodeIds.has(d.id) ? "#4da6ff" : "#222"))
        .attr("stroke-width", d => d.id === nodeData.id ? 3 : (connectedNodeIds.has(d.id) ? 2 : 1));

    linkElements
        .style("opacity", l => (l.source.id === nodeData.id || l.target.id === nodeData.id) ? (l.segue ? 1 : 0.8) : 0.05)
        .attr("stroke", l => {
            if (l.source.id === nodeData.id || l.target.id === nodeData.id) return l.segue ? "#ffbb33" : "#fff";
            return "#555";
        })
        .attr("stroke-width", l => {
            if (l.source.id === nodeData.id || l.target.id === nodeData.id) return Math.sqrt(l.weight) + 1.5;
            return Math.sqrt(l.weight) + 0.5;
        });

    labelElements
        .style("opacity", d => connectedNodeIds.has(d.id) ? 1 : 0.1)
        .text(d => {
            if (d.type === 'special') return d.title;
            // Show label if it's the selected node, a connected node, or a large background node
            if (d.id === nodeData.id || connectedNodeIds.has(d.id)) return d.title;
            return d.degree > 100 ? d.title : "";
        })
        .attr("fill", d => d.id === nodeData.id ? "#fff" : (connectedNodeIds.has(d.id) ? "#4da6ff" : "#ccc"));


    // Sidebar Stats update
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

    nodeElements.attr("stroke", d => {
        if (d.type === 'special') return "#fff";
        return d.title.toLowerCase().includes(searchTerm) ? "#ffff00" : "#222";
    }).attr("stroke-width", d => d.title.toLowerCase().includes(searchTerm) ? 3 : 1)
      .style("opacity", d => d.title.toLowerCase().includes(searchTerm) ? 1 : 0.3);

    labelElements.text(d => {
        if (d.type === 'special') return d.title;
        return d.title.toLowerCase().includes(searchTerm) ? d.title : (d.degree > 100 ? d.title : "");
    }).attr("fill", d => d.title.toLowerCase().includes(searchTerm) ? "#ffff00" : "#ccc")
      .style("opacity", d => d.title.toLowerCase().includes(searchTerm) ? 1 : 0.3);
      
    linkElements.style("opacity", 0.1);
}
