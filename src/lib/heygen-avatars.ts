// Dostępne awatary HeyGen do użycia w Awatar FAQ.
// voice_id = polski głos ElevenLabs (ten sam dla wszystkich — Filip).

export type HeygenAvatarOption = {
  id: string;
  name: string;
  description: string;
  previewImage: string;
};

export const FILIP_VOICE_ID = "9STbwZjpEbcYG88ZekIQ";

export const HEYGEN_AVATARS: HeygenAvatarOption[] = [
  {
    id: "5ebd3e687266437287b6c800f034198e",
    name: "Finance (Filip — digital twin)",
    description: "Oryginalny awatar Filipa, portret",
    previewImage:
      "https://files2.heygen.ai/avatar/v3/5ebd3e687266437287b6c800f034198e/half/2.2/preview_target.webp",
  },
  {
    id: "b45f91a7e4264416b4f4ec9b48f2a16e",
    name: "Marcus",
    description: "Mężczyzna w garniturze, landscape",
    previewImage:
      "https://files2.heygen.ai/talking_photo/37944c52e81f49ef8dd4dd49596010de/5f36c69b29fd405588822a246af968f0.WEBP",
  },
  {
    id: "28ea726f665349f3878b5188ccb4d1bf",
    name: "David",
    description: "Mężczyzna, landscape",
    previewImage:
      "https://files2.heygen.ai/talking_photo/540653d89aec435592730250ebb93f5e/9b5aa9ff881a4f6c84552e80a62f7603.WEBP",
  },
  {
    id: "74dd6e182f0d415ab740c1097d49304b",
    name: "Maya",
    description: "Kobieta, landscape",
    previewImage:
      "https://files2.heygen.ai/talking_photo/e5c37e51a2c848989158b30cdaa55784/a103a09aaba34277a7ebcc839e992d5b.WEBP",
  },
  {
    id: "b708f113a2a141b78289cc4a01e30ff9",
    name: "Priya",
    description: "Kobieta, landscape",
    previewImage:
      "https://files2.heygen.ai/talking_photo/c77a366eaa9d4491b1e53bb33eb78b5a/f2b94979bd694226bfa223d371e47f5c.WEBP",
  },
];
