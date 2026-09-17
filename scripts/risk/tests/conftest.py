# The pipeline modules live one level up and are imported as top-level names by the
# build, the gates and these tests alike, so the suite runs the same code the build does
# rather than a copy under a package path.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
