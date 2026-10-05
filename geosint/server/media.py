import atexit
import json
import math
import os
import re
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path


WEB_TYPES = {"JPEG": ".jpg", "PNG": ".png", "GIF": ".gif", "WEBP": ".webp"}
CUBE_FACES = "frblud"
_ImageInfo = tuple[str, int, int, bool]


def _convert_image(path: Path, *options: str) -> bytes:
    try:
        with path.open("rb") as source:
            done = subprocess.run(
                [
                    "/usr/bin/magick",
                    "-regard-warnings",
                    "-limit",
                    "memory",
                    "256MiB",
                    "-limit",
                    "map",
                    "512MiB",
                    "-limit",
                    "disk",
                    "1GiB",
                    "-limit",
                    "width",
                    "32768",
                    "-limit",
                    "height",
                    "32768",
                    "-[0]",
                    "-auto-orient",
                    "-strip",
                    *options,
                ],
                stdin=source,
                capture_output=True,
                timeout=120,
            )
    except (OSError, subprocess.SubprocessError) as error:
        raise ValueError(f"Cannot decode {path.name}") from error
    if done.returncode:
        raise ValueError(
            f"Cannot decode {path.name}: {done.stderr.decode(errors='replace').strip()}"
        )
    return done.stdout


def _probe_image(path: Path) -> _ImageInfo:
    fields = (
        _convert_image(path, "-format", "%m %w %h %[opaque]", "info:").decode().split()
    )
    if len(fields) != 4:
        raise ValueError(f"Invalid image {path.name}")
    width, height = map(int, fields[1:3])
    if not (
        0 < width <= 32768 and 0 < height <= 32768 and width * height <= 200_000_000
    ):
        raise ValueError(f"Image dimensions out of range: {path.name}")
    return fields[0], width, height, fields[3] == "True"


def _multires_path(value: object) -> Path:
    if not isinstance(value, str) or not re.fullmatch(r"[\w./%-]*", value, re.ASCII):
        raise ValueError("Multires paths must be local paths")
    path = Path(value.strip("/"))
    if ".." in path.parts:
        raise ValueError("Multires paths must stay inside the tile directory")
    return path


class Media:
    def __init__(self, root: Path, kind: str | None = None) -> None:
        self.root = root.resolve()
        self.cache_dir = Path(tempfile.mkdtemp(prefix="geosint-media-"))
        self.owner_pid = os.getpid()
        atexit.register(self.close)
        self.files: dict[str, Path] = {}
        self.state: dict[str, object]
        self.base_url = f"media/{secrets.token_hex(16)}"
        if kind is not None and kind not in (
            "image",
            "equirectangular",
            "cubemap",
            "multires",
        ):
            raise ValueError("Unsupported media kind")
        if not self.root.is_dir():
            raise ValueError("Media directory is missing")
        paths = sorted(path for path in self.root.iterdir() if path.is_file())
        faces = {path.stem.lower(): path for path in paths}
        if kind is None:
            if (self.root / "multires").is_dir():
                kind = "multires"
            elif set(CUBE_FACES) <= faces.keys():
                kind = "cubemap"
        if kind == "multires":
            self.state = {
                "kind": "pano",
                "type": kind,
                "multiRes": self._prepare_multires(),
            }
        elif kind == "cubemap":
            if set(faces) != set(CUBE_FACES) or len(paths) != 6:
                raise ValueError("Cubemap requires exactly six faces: f, r, b, l, u, d")
            face_info = [_probe_image(faces[face]) for face in CUBE_FACES]
            if any(
                item[1] != item[2] or item[1:3] != face_info[0][1:3]
                for item in face_info
            ):
                raise ValueError("Cubemap faces must be equally sized squares")
            urls = [
                self._prepare_image(faces[face], face, item)
                for face, item in zip(CUBE_FACES, face_info)
            ]
            self.state = {"kind": "pano", "type": kind, "faces": urls}
        else:
            if len(paths) != 1:
                raise ValueError(
                    "Image and equirectangular media require exactly one file"
                )
            info = _probe_image(paths[0])
            if kind is None:
                kind = "equirectangular" if abs(info[1] - 2 * info[2]) <= 2 else "image"
            name = "image" if kind == "image" else "pano"
            url = self._prepare_image(paths[0], name, info)
            self.state = (
                {"kind": "image", "url": url}
                if kind == "image"
                else {
                    "kind": "pano",
                    "type": kind,
                    "url": url,
                }
            )

    def _prepare_image(
        self,
        path: Path,
        name: str,
        info: _ImageInfo | None = None,
        suffix: str | None = None,
    ) -> str:
        if not path.is_file() or not path.resolve().is_relative_to(self.root):
            raise ValueError(f"Media file is missing or outside media: {path.name}")
        info = info or _probe_image(path)
        suffix = suffix or WEB_TYPES.get(info[0], ".jpg" if info[3] else ".png")
        name += suffix
        output = self.cache_dir / name
        output.parent.mkdir(parents=True, exist_ok=True)
        _convert_image(path, "-quality", "95", str(output))
        if not output.is_file() or not output.stat().st_size:
            raise ValueError(f"Empty image: {path.name}")
        self.files[name] = output
        return f"{self.base_url}/{name}"

    def close(self) -> None:
        if os.getpid() == self.owner_pid:
            shutil.rmtree(self.cache_dir, ignore_errors=True)

    def _prepare_multires(self) -> dict[str, int | str]:
        root = (self.root / "multires").resolve()
        if not root.is_relative_to(self.root):
            raise ValueError("Multires directory must stay inside media")
        config = json.loads((root / "config.json").read_text())
        if not isinstance(config, dict):
            raise ValueError("Multires config must be an object")
        config = config.get("multiRes", config)
        if not isinstance(config, dict):
            raise ValueError("MultiRes must be an object")
        for key in ("tileResolution", "cubeResolution", "maxLevel"):
            value = config.get(key)
            if type(value) is not int or not 0 < value <= (
                16 if key == "maxLevel" else 32768
            ):
                raise ValueError(f"Invalid multires {key}")
        extension = config.get("extension", "jpg")
        if extension not in ("jpg", "jpeg", "png", "webp"):
            raise ValueError("Unsupported multires tile extension")
        base = _multires_path(config.get("basePath", ""))
        pattern = config.get("path")
        fallback = config.get("fallbackPath")
        if not isinstance(pattern, str) or "%s" not in pattern:
            raise ValueError("Multires path must include a cube face")
        _multires_path(pattern)
        if fallback is not None:
            _multires_path(fallback)
            if "%s" not in fallback:
                raise ValueError("Multires fallbackPath must include a cube face")
        tiles = {}
        for level in range(1, config["maxLevel"] + 1):
            count = math.ceil(
                config["cubeResolution"]
                / 2 ** (config["maxLevel"] - level)
                / config["tileResolution"]
            )
            if len(tiles) + 6 * count * count > 100_000:
                raise ValueError("Too many multires tiles")
            for face in CUBE_FACES:
                for x in range(count):
                    for y in range(count):
                        name = (
                            pattern.replace("%l", str(level))
                            .replace("%s", face)
                            .replace("%x", str(x))
                            .replace("%y", str(y))
                        )
                        tiles[f"{level}/{face}{y}_{x}"] = base / _multires_path(name)
        if fallback is not None:
            tiles.update(
                {
                    f"fallback/{face}": base
                    / _multires_path(fallback.replace("%s", face))
                    for face in CUBE_FACES
                }
            )
        for tile, source in sorted(tiles.items()):
            if "%" in str(source):
                raise ValueError("Unknown multires path placeholder")
            path = root / f"{source}.{extension}"
            if not path.resolve().is_relative_to(root):
                raise ValueError("Multires tiles must stay inside the tile directory")
            self._prepare_image(path, f"multires/{tile}", suffix=f".{extension}")
        result = {
            key: config[key] for key in ("tileResolution", "cubeResolution", "maxLevel")
        }
        result.update(
            path="/%l/%s%y_%x",
            basePath=f"{self.base_url}/multires",
            extension=extension,
        )
        if fallback is not None:
            result["fallbackPath"] = "/fallback/%s"
        return result
