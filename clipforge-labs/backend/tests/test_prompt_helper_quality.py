from routers.generate import (
    PROMPT_HELPER_VISUAL_MAX_CHARS,
    _build_prompt_helper_analysis,
    _build_visual_prompt_pack,
)


def test_visual_prompt_pack_stays_within_api_budget():
    idea = (
        "A determined creator in a neon city races against time, overcomes a major setback, "
        "and ends with a confident hero moment while keeping consistent character identity."
    )
    prompt = _build_visual_prompt_pack(
        idea=idea,
        style_preset="real",
        aspect_ratio="9:16",
        duration_seconds=120,
    )
    assert prompt
    assert len(prompt) <= PROMPT_HELPER_VISUAL_MAX_CHARS
    assert "Title:" in prompt
    assert "Concept:" in prompt
    assert "Character:" in prompt
    assert "Aspect ratio:" in prompt
    assert "Visual style:" in prompt


def test_prompt_helper_analysis_returns_expected_sections():
    idea = "An anime hero gets stronger after every battle and protects the city."
    analysis = _build_prompt_helper_analysis(
        idea=idea,
        style_preset="anime",
        duration_seconds=90,
    )
    assert isinstance(analysis.get("continuity_anchor"), str)
    assert isinstance(analysis.get("hook_focus"), str)
    assert isinstance(analysis.get("quality_guardrails"), list)
    assert isinstance(analysis.get("camera_plan"), list)
    assert len(analysis["camera_plan"]) > 0
