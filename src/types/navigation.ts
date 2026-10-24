export type ActiveModuleTab = 'stormwater' | 'water-distribution' | 'wastewater';

export interface ModuleTabItem {
  id: ActiveModuleTab;
  label: string;
  shortLabel?: string;
  description: string;
}

export const MODULE_TABS: ModuleTabItem[] = [
  {
    id: 'stormwater',
    label: 'Stormwater modelling',
    shortLabel: 'Stormwater',
    description: 'Catchment & Stream Delineation, Culvert Hydrology',
  },
  {
    id: 'water-distribution',
    label: 'Water Distribution Modelling',
    shortLabel: 'Water Distribution',
    description: 'Pressurized Network Hydraulics & Elevation Datum',
  },
  {
    id: 'wastewater',
    label: 'Wastewater Modelling',
    shortLabel: 'Wastewater',
    description: 'Gravity Sewer Collection & Lift Station Hydraulics',
  },
];
