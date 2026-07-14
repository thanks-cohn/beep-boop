from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_reader_does_not_call_landing_shell_or_replace_root_for_pages():
    reader = (ROOT/"src/page/reader.js").read_text()
    assert "createLandingBlockShell" not in reader
    assert "Blocks.start({" in reader and "center: null" in reader
    assert "layoutParts.content.replaceChildren(wrapper)" in reader
    assert "root.replaceChildren(wrapper)" not in reader


def test_blocks_api_respects_explicit_null_center():
    blocks = (ROOT/"src/components/blocks.js").read_text()
    assert "Object.prototype.hasOwnProperty.call(options, name)" in blocks
    assert "if (value === null) return null" in blocks
    assert "options.center ||" not in blocks
