declare module 'react-plotly.js' {
  import { Component } from 'react';

  interface PlotParams {
    data: Plotly.Data[];
    layout?: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    frames?: Plotly.Frame[];
    useResizeHandler?: boolean;
    style?: React.CSSProperties;
    className?: string;
    onInitialized?: (figure: Readonly<PlotParams>, graphDiv: Readonly<HTMLElement>) => void;
    onUpdate?: (figure: Readonly<PlotParams>, graphDiv: Readonly<HTMLElement>) => void;
    onPurge?: (figure: Readonly<PlotParams>, graphDiv: Readonly<HTMLElement>) => void;
    onError?: (err: Readonly<Error>) => void;
    divId?: string;
  }

  class Plot extends Component<PlotParams> {}
  export default Plot;
}

declare namespace Plotly {
  interface Data {
    x?: (string | number | Date)[];
    y?: (string | number | Date)[];
    type?: string;
    mode?: string;
    marker?: Partial<{
      color: string | string[];
      size: number | number[];
      line: Partial<{ width: number; color: string }>;
    }>;
    hovertemplate?: string;
    text?: string[];
    name?: string;
    [key: string]: unknown;
  }

  interface Layout {
    autosize?: boolean;
    width?: number;
    height?: number;
    margin?: Partial<{ t: number; r: number; b: number; l: number; pad: number }>;
    xaxis?: Partial<LayoutAxis>;
    yaxis?: Partial<LayoutAxis>;
    plot_bgcolor?: string;
    paper_bgcolor?: string;
    bargap?: number;
    bargroupgap?: number;
    font?: Partial<{ family: string; size: number; color: string }>;
    showlegend?: boolean;
    [key: string]: unknown;
  }

  interface LayoutAxis {
    range?: [number, number];
    ticksuffix?: string;
    tickprefix?: string;
    tickfont?: Partial<{ size: number; color: string }>;
    gridcolor?: string;
    zeroline?: boolean;
    showgrid?: boolean;
    [key: string]: unknown;
  }

  interface Config {
    displayModeBar?: boolean;
    responsive?: boolean;
    staticPlot?: boolean;
    [key: string]: unknown;
  }

  interface Frame {
    name?: string;
    data?: Data[];
    layout?: Partial<Layout>;
    [key: string]: unknown;
  }
}
