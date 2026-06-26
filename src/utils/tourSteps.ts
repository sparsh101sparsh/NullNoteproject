export interface TourStep {
  target: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: 'video-title',
    title: 'Video Title',
    description: 'Rename this note so you can find it later.'
  },
  {
    target: 'editor-area',
    title: 'Write Notes',
    description: 'Write notes while watching the video.'
  },
  {
    target: 'snap-button',
    title: 'Take Snapshot',
    description: 'Save the current video frame to your notes.'
  },
  {
    target: 'marker-button',
    title: 'Add Marker',
    description: 'Mark important moments and revisit them later.'
  },
  {
    target: 'marker-icon-picker',
    title: 'Marker Colors',
    description: 'Use colors to organize different types of notes.'
  },
  {
    target: 'auto-snap-toggle',
    title: 'AutoSnap',
    description: 'Automatically save screenshots while the video plays.'
  },
  {
    target: 'filter-dropdown',
    title: 'Organize Notes',
    description: 'Show only the notes and screenshots you need.'
  },
  {
    target: 'search-button',
    title: 'Search Notes',
    description: 'Find notes, markers, and screenshots instantly.'
  },
  {
    target: 'export-button',
    title: 'Export Notes',
    description: 'Download your notes with all screenshots included.'
  },
  {
    target: 'notes-list-button',
    title: 'Saved Notes',
    description: 'Switch between videos and open older notes anytime.'
  }
];
