'use client';

import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface Props {
  data: { sprint_label: string; avg_allocation: number }[];
}

export default function AllocationChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        No allocation data yet
      </div>
    );
  }

  return (
    <Plot
      data={[
        {
          x: data.map((d) => d.sprint_label),
          y: data.map((d) => d.avg_allocation),
          type: 'bar',
          marker: {
            color: '#3b82f6',
            line: { width: 0 },
          },
          hovertemplate: '%{x}<br>%{y:.0f}%<extra></extra>',
        },
      ]}
      layout={{
        autosize: true,
        height: 220,
        margin: { t: 10, r: 10, b: 40, l: 40 },
        yaxis: {
          range: [0, 100],
          ticksuffix: '%',
          tickfont: { size: 11, color: '#9ca3af' },
          showgrid: false,
          zeroline: false,
        },
        xaxis: {
          tickfont: { size: 11, color: '#9ca3af' },
        },
        plot_bgcolor: 'rgba(0,0,0,0)',
        paper_bgcolor: 'rgba(0,0,0,0)',
        bargap: 0.3,
      }}
      config={{
        displayModeBar: false,
        responsive: true,
      }}
      useResizeHandler
      style={{ width: '100%', height: '220px' }}
    />
  );
}
