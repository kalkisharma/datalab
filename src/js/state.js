// state.js — application state schema and session serialization

const VERSION = '0.0.0';

const appState = {
  datasets:    [],
  series:      [],
  plotConfig:  {
    title: '', xLabel: '', yLabel: '',
    figWidth: 700, figHeight: 500,
    titleLocked: false, xLabelLocked: false, yLabelLocked: false,
    annotPos: 'top-left', figInited: false,
    majorGrid: true, minorGrid: false,
  },
  style: {
    markerSize: 6, markerOpacity: 0.8,
    edgeColor: '#ffffff', edgeWidth: 0.5,
    colormap: 'Viridis',
  },
  savedPlots:    [],
  plotRendered:  false,
};
