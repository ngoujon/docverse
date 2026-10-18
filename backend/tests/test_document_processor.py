from app.services import document_processor as dp


def test_guess_doc_type_recognizes_audio_extensions():
    for ext in (".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"):
        assert dp.guess_doc_type(f"memo{ext}") == "audio"


def test_content_matches_type_accepts_real_audio_signatures():
    assert dp.content_matches_type("audio", b"ID3\x03\x00\x00\x00" + b"\x00" * 20)
    assert dp.content_matches_type("audio", b"\xff\xfb\x90\x00" + b"\x00" * 20)
    assert dp.content_matches_type("audio", b"RIFF\x00\x00\x00\x00WAVEfmt ")
    assert dp.content_matches_type("audio", b"OggS\x00\x02" + b"\x00" * 20)
    assert dp.content_matches_type("audio", b"fLaC" + b"\x00" * 20)
    assert dp.content_matches_type("audio", b"\x00\x00\x00\x18ftypM4A " + b"\x00" * 10)


def test_content_matches_type_rejects_non_audio_for_audio_type():
    assert not dp.content_matches_type("audio", b"%PDF-1.4 not actually audio")


def test_wav_and_webp_riff_signatures_are_disambiguated():
    wav_bytes = b"RIFF\x00\x00\x00\x00WAVEfmt "
    webp_bytes = b"RIFF\x00\x00\x00\x00WEBPVP8 "
    assert dp.content_matches_type("audio", wav_bytes)
    assert not dp.content_matches_type("image", wav_bytes)
    assert dp.content_matches_type("image", webp_bytes)
    assert not dp.content_matches_type("audio", webp_bytes)
