import importlib.metadata as md, traceback, os

R = []


def run(id, dist, fn):
    try:
        v = md.version(dist)
    except Exception as e:
        R.append((False, id, dist, "?", f"version lookup failed: {e}"))
        return
    try:
        R.append((True, id, dist, v, fn()))
    except Exception as e:
        R.append((False, id, dist, v, traceback.format_exc().strip().split("\n")[-1]))


def t_rdflib():
    import rdflib

    g = rdflib.Graph()
    g.parse(data='<http://a/s> <http://a/p> "lit" .', format="nt")
    assert len(g) == 1, len(g)
    q = list(g.query("SELECT ?o WHERE { ?s ?p ?o }"))
    ttl = g.serialize(format="turtle")
    assert "lit" in ttl
    return f"parsed 1 N-Triple, SPARQL returned {q[0][0]}, re-serialised to Turtle ({len(ttl)} chars)"


def t_pyshacl():
    from pyshacl import validate

    data = "@prefix ex: <http://ex/> . ex:bob a ex:Person ."
    shapes = (
        "@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://ex/> ."
        "ex:S a sh:NodeShape ; sh:targetClass ex:Person ; "
        "sh:property [ sh:path ex:name ; sh:minCount 1 ] ."
    )
    conforms, _, txt = validate(
        data,
        shacl_graph=shapes,
        data_graph_format="turtle",
        shacl_graph_format="turtle",
    )
    assert conforms is False, "shape should have failed (ex:bob has no ex:name)"
    return "SHACL constraint correctly reported non-conformance for a missing required property"


def t_igraph():
    import igraph

    g = igraph.Graph.Ring(6)
    assert g.vcount() == 6 and g.ecount() == 6
    d = g.diameter()
    return f"ring graph v={g.vcount()} e={g.ecount()} diameter={d}"


def t_pypdf():
    from pypdf import PdfReader, PdfWriter

    r = PdfReader("fixture.pdf")
    txt = r.pages[0].extract_text()
    assert "REGISTRY" in txt, repr(txt)
    w = PdfWriter()
    w.add_page(r.pages[0])
    w.write("pypdf-out.pdf")
    return f"read {len(r.pages)}pg, extracted {txt.strip()!r}, rewrote to pypdf-out.pdf"


def t_pymupdf():
    import pymupdf

    d = pymupdf.open("fixture.pdf")
    txt = d[0].get_text().strip()
    assert "REGISTRY" in txt, repr(txt)
    pix = d[0].get_pixmap(dpi=100)
    pix.save("pymupdf-out.png")
    return f"{d.page_count}pg, text={txt!r}, rasterised {pix.width}x{pix.height} png"


def t_pillow():
    from PIL import Image

    im = Image.new("RGB", (90, 40), (10, 120, 200))
    im.save("pillow-out.png")
    re = Image.open("pillow-out.png")
    assert re.size == (90, 40) and re.mode == "RGB"
    th = re.resize((30, 13))
    return f"wrote+reopened png {re.size} {re.mode}, resized to {th.size}"


def t_imageio():
    import imageio.v3 as iio

    a = iio.imread("pillow-out.png")
    assert a.shape[:2] == (40, 90), a.shape
    return f"read png as ndarray shape={a.shape} dtype={a.dtype}"


def t_skimage():
    import skimage, numpy as np
    from skimage.filters import sobel
    from skimage.color import rgb2gray
    import imageio.v3 as iio

    g = rgb2gray(iio.imread("pillow-out.png"))
    e = sobel(g)
    return f"rgb2gray+sobel edge filter ran, output shape={e.shape} max={e.max():.4f}"


def t_cv2():
    import cv2, numpy as np

    img = cv2.imread("pillow-out.png")
    assert img is not None and img.shape == (40, 90, 3), getattr(img, "shape", None)
    sm = cv2.resize(img, (45, 20))
    gr = cv2.cvtColor(sm, cv2.COLOR_BGR2GRAY)
    return f"build={cv2.__version__} imread {img.shape} -> resize {sm.shape} -> gray {gr.shape}"


run(217, "rdflib", t_rdflib)
run(222, "pyshacl", t_pyshacl)
run(212, "igraph", t_igraph)
run(272, "pypdf", t_pypdf)
run(271, "PyMuPDF", t_pymupdf)
run(275, "Pillow", t_pillow)
run(280, "imageio", t_imageio)
run(279, "scikit-image", t_skimage)
run(274, "opencv-python", t_cv2)

for ok, id, d, v, msg in R:
    print(f"{'PASS' if ok else 'FAIL'} id={id} {d}@{v} :: {msg}")
print(f"\nPY SMOKE: {sum(1 for r in R if r[0])}/{len(R)} passed")
