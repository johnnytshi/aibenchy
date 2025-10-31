const resultsContainer = document.getElementById('results');
const gemmShapeFilter = document.getElementById('gemmShapeFilter');

let benchmarkData = [];

window.addEventListener('load', async () => {
    try {
        const response = await fetch('/api/results');
        benchmarkData = await response.json();
        populateFilters();
        renderResults();
    } catch (error) {
        console.error('Error fetching benchmark data:', error);
        resultsContainer.innerHTML = '<p>Error loading benchmark data. Make sure the server is running and the results directory is accessible.</p>';
    }
});

function populateFilters() {
    const gemmShapes = new Set();
    benchmarkData.forEach(data => {
        if (data.parsed && data.parsed.matrixMultiplication) {
            data.parsed.matrixMultiplication.forEach(d => {
                if (d.m && d.n && d.k) {
                    gemmShapes.add(`${d.m}x${d.n}x${d.k}`);
                } else if (d.size) {
                    gemmShapes.add(d.size);
                }
            });
        }
    });

    gemmShapeFilter.innerHTML = '<option value="all">All</option>';
    [...gemmShapes].sort().forEach(shape => {
        const option = document.createElement('option');
        option.value = shape;
        option.textContent = shape;
        gemmShapeFilter.appendChild(option);
    });

    gemmShapeFilter.addEventListener('change', renderResults);
}
function renderResults() {
    resultsContainer.innerHTML = '';
    const selectedGemmShape = gemmShapeFilter.value;


    const filteredData = benchmarkData.map(data => {
        let matrixMultiplication = data.parsed.matrixMultiplication;
        if (selectedGemmShape !== 'all') {
            matrixMultiplication = matrixMultiplication.filter(d => {
                if (d.m && d.n && d.k) {
                    return `${d.m}x${d.n}x${d.k}` === selectedGemmShape;
                } else if (d.size) {
                    return d.size == selectedGemmShape;
                }
                return false;
            });
        }

        return {
            ...data,
            parsed: {
                ...data.parsed,
                matrixMultiplication,
            }
        };
    });

    const numRuns = filteredData.length;

    if (numRuns > 0) {

        // GEMM Chart
        const gemmCard = document.createElement('div');
        gemmCard.classList.add('result-card');
        const gemmCanvas = document.createElement('canvas');
        gemmCard.appendChild(gemmCanvas);
        resultsContainer.appendChild(gemmCard);

        const gemmChartData = {
            labels: filteredData.map(d => new Date(d.metadata.timestamp).toLocaleString()),
            datasets: []
        };

        const shapes = new Set();
        filteredData.forEach(data => {
            if (data.parsed && data.parsed.matrixMultiplication) {
                data.parsed.matrixMultiplication.forEach(d => {
                    if (d.m && d.n && d.k) {
                        shapes.add(`${d.m}x${d.n}x${d.k}`);
                    } else if (d.size) {
                        shapes.add(d.size);
                    }
                });
            }
        });

        [...shapes].sort().forEach(shape => {
            gemmChartData.datasets.push({
                label: `GEMM ${shape} (TOPS)`,
                data: filteredData.map(data => {
                    const matrixData = data.parsed.matrixMultiplication.find(d => {
                        if (d.m && d.n && d.k) {
                            return `${d.m}x${d.n}x${d.k}` === shape;
                        } else if (d.size) {
                            return d.size == shape;
                        }
                        return false;
                    });
                    return matrixData ? (matrixData.tops || matrixData.gflops / 1000) : null;
                }),
                fill: false,
                borderColor: getRandomColor(),
                tension: 0.1
            });
        });

        new Chart(gemmCanvas, {
            type: 'line',
            data: gemmChartData,
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: 'Matrix Multiplication Performance'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'TOPS'
                        }
                    }
                }
            }
        });


        // Flash Attention Chart
        const flashCard = document.createElement('div');
        flashCard.classList.add('result-card');
        const flashCanvas = document.createElement('canvas');
        flashCard.appendChild(flashCanvas);
        resultsContainer.appendChild(flashCard);

        const flashChartData = {
            labels: filteredData.map(d => new Date(d.metadata.timestamp).toLocaleString()),
            datasets: [{
                label: 'Flash Attention (Tokens/Sec)',
                data: filteredData.map(d => d.parsed.flashAttention ? d.parsed.flashAttention.tokensPerSec : null),
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        };

        new Chart(flashCanvas, {
            type: 'bar',
            data: flashChartData,
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: 'Flash Attention Performance'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Tokens/Sec'
                        }
                    }
                }
            }
        });
    }
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}
