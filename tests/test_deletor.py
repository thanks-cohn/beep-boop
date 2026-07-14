import json, shutil, sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import deletor


def write(p, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=4) + "\n", encoding="utf-8")


def fixture(tmp_path):
    root=tmp_path
    d=root/"src/data"; (root/"scripts").mkdir(parents=True); (root/"src/tools").mkdir(parents=True); (root/"public/data").mkdir(parents=True)
    shutil.copy(Path(__file__).resolve().parents[1]/"scripts/generate_search.py", root/"scripts/generate_search.py")
    shutil.copy(Path(__file__).resolve().parents[1]/"src/tools/generate_search.py", root/"src/tools/generate_search.py")
    write(d/"storage.json", {"active":"production","production":{"sources":{"e":"https://cdn.test/works"}}})
    works=[{"slug":"One","display":"One","source":"e","manifest":"works/One.json"},{"slug":"Two Weird!","display":"Two Weird!","source":"e","manifest":"works/Two Weird!.json"},{"slug":"Three","display":"Three","source":"e","manifest":"works/Three.json"}]
    write(d/"fetch.json", {"version":2,"works":works})
    write(d/"rotunda.json", works[:])
    for w in works: write(d/w["manifest"], {"version":1,"slug":w["slug"],"display":w["display"],"source":"e","chapters":["chapter_1"]})
    write(d/"search.index.json", {"entries":[{"type":"work","work":"One"},{"type":"chapter","work":"Two Weird!"}]})
    write(root/"public/data/search.index.json", {"entries":[]})
    return root,d


def test_deleting_one_work(monkeypatch,tmp_path):
    root,d=fixture(tmp_path); monkeypatch.setattr(deletor,"repo_root",lambda:root)
    plan=deletor.build_plan(d,["One"]); deletor.apply_plan(root,d,plan)
    assert not (d/"works/One.json").exists()
    assert [w["slug"] for w in json.loads((d/"fetch.json").read_text())["works"]] == ["Two Weird!","Three"]
    assert (root/".deletor-backups").exists()


def test_deleting_several_and_punctuation_slug(monkeypatch,tmp_path):
    root,d=fixture(tmp_path); monkeypatch.setattr(deletor,"repo_root",lambda:root)
    plan=deletor.build_plan(d,["One","Two Weird!"]); deletor.apply_plan(root,d,plan)
    assert [w["slug"] for w in json.loads((d/"rotunda.json").read_text())] == ["Three"]
    assert not (d/"works/Two Weird!.json").exists()


def test_dry_run_makes_no_changes(monkeypatch,tmp_path,capsys):
    root,d=fixture(tmp_path); before=(d/"fetch.json").read_text(); monkeypatch.setattr(deletor,"repo_root",lambda:root)
    assert deletor.main(["--data-dir", str(d.relative_to(root)), "--slug", "One", "--dry-run"]) == 0
    assert (d/"fetch.json").read_text() == before


def test_array_based_catalog(tmp_path):
    root,d=fixture(tmp_path); write(d/"fetch.json", json.loads((d/"rotunda.json").read_text()))
    plan=deletor.build_plan(d,["Three"])
    assert isinstance(plan.json_updates[d/"fetch.json"], list)
    assert [x["slug"] for x in plan.json_updates[d/"fetch.json"]] == ["One","Two Weird!"]


def test_malformed_json_causes_no_partial_writes(monkeypatch,tmp_path):
    root,d=fixture(tmp_path); monkeypatch.setattr(deletor,"repo_root",lambda:root)
    (d/"bad.json").write_text("{")
    with pytest.raises(json.JSONDecodeError): deletor.build_plan(d,["One"])
    assert (d/"works/One.json").exists()


def test_ambiguous_title_match_not_deleted(tmp_path):
    root,d=fixture(tmp_path); write(d/"blocks.json", {"left":[{"id":"One","text":"One"}]})
    plan=deletor.build_plan(d,["One"])
    assert d/"blocks.json" not in plan.json_updates
    assert plan.warnings


def test_rollback_after_failure(monkeypatch,tmp_path):
    root,d=fixture(tmp_path); monkeypatch.setattr(deletor,"repo_root",lambda:root)
    before=(d/"fetch.json").read_text(); plan=deletor.build_plan(d,["One"])
    monkeypatch.setattr(deletor,"regenerate_search", lambda *a: (_ for _ in ()).throw(RuntimeError("boom")))
    with pytest.raises(RuntimeError): deletor.apply_plan(root,d,plan)
    assert (d/"fetch.json").read_text() == before
    assert (d/"works/One.json").exists()
