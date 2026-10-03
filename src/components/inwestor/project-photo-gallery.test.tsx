import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ProjectPhotoGallery,
  ProjectPhotoThumbs,
  type GalleryPhoto,
} from "./project-photo-gallery";

const PHOTOS: GalleryPhoto[] = [
  { url: "https://cdn.example/a.jpg", name: "a.jpg" },
  { url: "https://cdn.example/b.jpg", name: "b.jpg" },
  { url: "https://cdn.example/c.jpg", name: "c.jpg" },
];

/** Tak jak w karcie Projektu: slajder i miniatury dzielą jeden stan indeksu. */
function Harness({ photos }: { photos: GalleryPhoto[] }) {
  const [idx, setIdx] = useState(0);
  return (
    <>
      <ProjectPhotoGallery photos={photos} index={idx} onIndexChange={setIdx} />
      <ProjectPhotoThumbs photos={photos} index={idx} onIndexChange={setIdx} />
      <output data-testid="idx">{idx + 1}</output>
    </>
  );
}

describe("ProjectPhotoGallery", () => {
  it("shows a counter and arrows instead of links that leave the page", () => {
    render(<Harness photos={PHOTOS} />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poprzednie zdjęcie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Następne zdjęcie" })).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("thumbnail click selects that photo in the slider", async () => {
    const user = userEvent.setup();
    render(<Harness photos={PHOTOS} />);
    await user.click(screen.getByRole("button", { name: "Zdjęcie 3 z 3" }));
    expect(screen.getByTestId("idx")).toHaveTextContent("3");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zdjęcie 3 z 3" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("clicking the photo opens an in-page preview with keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<Harness photos={PHOTOS} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Powiększ zdjęcie 1 z 3" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("idx")).toHaveTextContent("2");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    // Zapętlone: z pierwszego zdjęcia w lewo na ostatnie.
    expect(screen.getByTestId("idx")).toHaveTextContent("3");
  });

  it("hides the arrows and counter for a single photo, and renders a placeholder for none", () => {
    const { unmount } = render(<Harness photos={PHOTOS.slice(0, 1)} />);
    expect(screen.queryByRole("button", { name: "Następne zdjęcie" })).toBeNull();
    expect(screen.queryByText("1 / 1")).toBeNull();
    unmount();
    render(<Harness photos={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
