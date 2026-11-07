"""T-008: draft schema shape."""

from app.models.llm_drafts import PlanDraft, QADraft

_FORBIDDEN_KEYS = {
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "default",
    "anyOf",
    "oneOf",
}


def _walk_schema(node, bad: set[str]):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in _FORBIDDEN_KEYS:
                bad.add(k)
            _walk_schema(v, bad)
    elif isinstance(node, list):
        for item in node:
            _walk_schema(item, bad)


def test_plan_draft_schema_constraint_free():
    schema = PlanDraft.model_json_schema()
    bad: set[str] = set()
    _walk_schema(schema, bad)
    assert not bad
    seg_items = schema["properties"]["segments"]["items"]
    if "$ref" in seg_items:
        defs = schema.get("$defs") or schema.get("definitions") or {}
        ref = seg_items["$ref"].split("/")[-1]
        seg_items = defs[ref]
    props = seg_items["properties"]
    assert list(props.keys()) == ["goal", "page", "line_start", "line_end", "narration"]
    assert set(schema["required"]) == {"title", "segments"}
    for seg_key in ("goal", "page", "line_start", "line_end", "narration"):
        assert seg_key in seg_items.get("required", [])


def test_qa_draft_schema():
    schema = QADraft.model_json_schema()
    bad: set[str] = set()
    _walk_schema(schema, bad)
    assert not bad
    assert set(schema["required"]) == {"answerable", "answer", "cites", "bridge"}
