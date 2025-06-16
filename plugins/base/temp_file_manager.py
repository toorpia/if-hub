import os
import glob
import uuid
from datetime import datetime
from pathlib import Path
from typing import List

class TempFileManager:
    """一時ファイル管理マネージャー"""
    
    def __init__(self, equipment_name: str):
        self.equipment_name = equipment_name
        self.pid = os.getpid()
        self.session_id = str(uuid.uuid4())[:8]
        
        # 一時ファイルディレクトリ作成
        self.temp_dir = Path("tmp")
        self.temp_dir.mkdir(exist_ok=True)
    
    def generate_temp_filename(self, file_type: str = "csv") -> str:
        """
        ユニークな一時ファイル名生成
        
        格式: {設備名}_{日付時刻}_{PID}_{セッションID}.{拡張子}
        例: 7th-untan_20250616_143022_12345_a1b2c3d4.csv
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.equipment_name}_{timestamp}_{self.pid}_{self.session_id}.{file_type}"
        return str(self.temp_dir / filename)
    
    def list_temp_files(self) -> List[str]:
        """現在のセッションの一時ファイル一覧取得"""
        pattern = f"{self.equipment_name}_*_{self.pid}_{self.session_id}.*"
        return glob.glob(str(self.temp_dir / pattern))
    
    def cleanup_temp_files(self) -> None:
        """セッション終了時の一時ファイル削除"""
        temp_files = self.list_temp_files()
        for file_path in temp_files:
            try:
                os.remove(file_path)
                print(f"Cleaned up temp file: {file_path}")
            except OSError as e:
                print(f"Failed to remove temp file {file_path}: {e}")
    
    def cleanup_old_temp_files(self, max_age_hours: int = 24) -> None:
        """古い一時ファイルの一括削除"""
        cutoff_time = datetime.now().timestamp() - (max_age_hours * 3600)
        
        pattern = f"{self.equipment_name}_*"
        for file_path in glob.glob(str(self.temp_dir / pattern)):
            try:
                if os.path.getmtime(file_path) < cutoff_time:
                    os.remove(file_path)
                    print(f"Cleaned up old temp file: {file_path}")
            except OSError as e:
                print(f"Failed to remove old temp file {file_path}: {e}")
