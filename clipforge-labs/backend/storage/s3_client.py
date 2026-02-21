import os

import boto3
from botocore.config import Config


def uses_object_storage_backend(backend: str | None) -> bool:
    return (backend or "").strip().lower() in {"s3", "gcs"}


def _default_addressing_style(endpoint_url: str | None) -> str | None:
    endpoint = (endpoint_url or "").strip().lower()
    # GCS S3 interoperability is most reliable with path-style addressing.
    if "storage.googleapis.com" in endpoint:
        return "path"
    return None


def build_s3_client(*, region_name: str | None = None):
    endpoint_url = (os.getenv("S3_ENDPOINT_URL") or "").strip() or None
    signature_version = (os.getenv("S3_SIGNATURE_VERSION") or "s3v4").strip() or "s3v4"
    is_gcs_endpoint = "storage.googleapis.com" in (endpoint_url or "").lower()

    addressing_style = (os.getenv("S3_ADDRESSING_STYLE") or "").strip().lower() or _default_addressing_style(endpoint_url)
    config_kwargs: dict = {"signature_version": signature_version}
    if addressing_style in {"path", "virtual"}:
        config_kwargs["s3"] = {"addressing_style": addressing_style}

    # GCS S3 compatibility is sensitive to AWS payload-signing/checksum defaults
    # in newer botocore versions for PutObject.
    if is_gcs_endpoint:
        s3_cfg = dict(config_kwargs.get("s3") or {})
        s3_cfg["payload_signing_enabled"] = False
        config_kwargs["s3"] = s3_cfg
        config_kwargs["request_checksum_calculation"] = "when_required"
        config_kwargs["response_checksum_validation"] = "when_required"

    resolved_region = (region_name or os.getenv("AWS_REGION") or "us-east-1").strip() or "us-east-1"
    if is_gcs_endpoint and resolved_region.lower() in {"auto", "automatic"}:
        resolved_region = "us-east-1"

    try:
        cfg = Config(**config_kwargs)
    except TypeError:
        # Backward compatibility for older botocore builds that do not
        # support checksum config kwargs.
        config_kwargs.pop("request_checksum_calculation", None)
        config_kwargs.pop("response_checksum_validation", None)
        cfg = Config(**config_kwargs)

    return boto3.client(
        "s3",
        region_name=resolved_region,
        endpoint_url=endpoint_url,
        config=cfg,
    )
