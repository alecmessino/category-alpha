# The watch modules are imported as top-level names by the capture tool and by these tests
# alike, so the suite exercises the same code the pipeline runs rather than a copy.
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parents[3] / "scripts"))
