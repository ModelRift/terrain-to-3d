export interface LocationPreset {
  id: string;
  label: string;
  lat: number;
  lon: number;
  photoThumbSrc: string;
  photoFullSrc: string;
  photoSourceUrl: string;
  photoAlt: string;
}

export const LOCATION_PRESETS: readonly LocationPreset[] = [
  {
    id: "mont-blanc",
    label: "Mont Blanc",
    lat: 45.8326,
    lon: 6.8652,
    photoThumbSrc: "/assets/mountain-photos/thumbs/mont-blanc.jpg",
    photoFullSrc: "/assets/mountain-photos/full/mont-blanc.jpg",
    photoSourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Mont_Blanc_Aiguille.jpg",
    photoAlt: "Mont Blanc real photo",
  },
  {
    id: "mt-everest",
    label: "Mt. Everest",
    lat: 27.9881,
    lon: 86.925,
    photoThumbSrc: "/assets/mountain-photos/thumbs/mt-everest.jpg",
    photoFullSrc: "/assets/mountain-photos/full/mt-everest.jpg",
    photoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/commons/1/15/Mt._Everest_from_Gokyo_Ri_November_5%2C_2012.jpg",
    photoAlt: "Mount Everest real photo",
  },
  {
    id: "k2",
    label: "K2",
    lat: 35.88,
    lon: 76.5151,
    photoThumbSrc: "/assets/mountain-photos/thumbs/k2.jpg",
    photoFullSrc: "/assets/mountain-photos/full/k2.jpg",
    photoSourceUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Chogori.jpg",
    photoAlt: "K2 real photo",
  },
  {
    id: "mt-fuji",
    label: "Mt. Fuji",
    lat: 35.3606,
    lon: 138.7274,
    photoThumbSrc: "/assets/mountain-photos/thumbs/mt-fuji.jpg",
    photoFullSrc: "/assets/mountain-photos/full/mt-fuji.jpg",
    photoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/commons/f/f8/View_of_Mount_Fuji_from_%C5%8Cwakudani_20211202.jpg",
    photoAlt: "Mount Fuji real photo",
  },
  {
    id: "matterhorn",
    label: "Matterhorn",
    lat: 45.9766,
    lon: 7.6585,
    photoThumbSrc: "/assets/mountain-photos/thumbs/matterhorn.jpg",
    photoFullSrc: "/assets/mountain-photos/full/matterhorn.jpg",
    photoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/commons/6/60/Matterhorn_from_Domh%C3%BCtte_-_2.jpg",
    photoAlt: "Matterhorn real photo",
  },
  {
    id: "grand-canyon",
    label: "Grand Canyon",
    lat: 36.1069,
    lon: -112.1129,
    photoThumbSrc: "/assets/mountain-photos/thumbs/grand-canyon.jpg",
    photoFullSrc: "/assets/mountain-photos/full/grand-canyon.jpg",
    photoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/commons/3/31/Canyon_River_Tree_%28165872763%29.jpeg",
    photoAlt: "Grand Canyon real photo",
  },
  {
    id: "mount-ararat",
    label: "Mount Ararat",
    lat: 39.7023,
    lon: 44.298,
    photoThumbSrc: "/assets/mountain-photos/thumbs/mount-ararat.jpg",
    photoFullSrc: "/assets/mountain-photos/full/mount-ararat.jpg",
    photoSourceUrl:
      "https://upload.wikimedia.org/wikipedia/commons/7/75/Mount_Ararat_and_the_Yerevan_skyline_in_spring_%2850mm%29.jpg",
    photoAlt: "Mount Ararat real photo",
  },
] as const;

export function findLocationPresetByCoords(
  lat: number,
  lon: number,
  tolerance = 1e-6
): LocationPreset | null {
  return (
    LOCATION_PRESETS.find(
      (preset) =>
        Math.abs(preset.lat - lat) <= tolerance &&
        Math.abs(preset.lon - lon) <= tolerance
    ) ?? null
  );
}
