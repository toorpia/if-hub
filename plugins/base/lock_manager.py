import fcntl
import time
import os
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime
from typing import Generator, Dict, Any

class EquipmentLockManager:
    """設備別排他制御マネージャー"""
    
    def __init__(self, equipment_name: str):
        self.equipment_name = equipment_name
        self.lock_dir = Path("logs") / equipment_name
        self.lock_file = self.lock_dir / ".lock"
        
        # ディレクトリ作成
        self.lock_dir.mkdir(parents=True, exist_ok=True)
    
    @contextmanager
    def acquire_lock(self, timeout: int = 30) -> Generator[None, None, None]:
        """設備別排他制御コンテキストマネージャー"""
        lock_fd = None
        try:
            lock_fd = open(self.lock_file, 'w')
            
            # ノンブロッキングロック試行
            start_time = time.time()
            while time.time() - start_time < timeout:
                try:
                    fcntl.flock(lock_fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    
                    # ロック取得成功：プロセス情報記録
                    lock_info = f"PID: {os.getpid()}\nTimestamp: {datetime.now().isoformat()}\nEquipment: {self.equipment_name}\n"
                    lock_fd.write(lock_info)
                    lock_fd.flush()
                    
                    yield
                    return
                    
                except IOError:
                    # ロック取得失敗：待機
                    time.sleep(1)
            
            raise TimeoutError(f"Could not acquire lock for {self.equipment_name} within {timeout}s")
            
        finally:
            if lock_fd:
                try:
                    fcntl.flock(lock_fd.fileno(), fcntl.LOCK_UN)
                    lock_fd.close()
                except Exception:
                    pass
    
    def is_locked(self) -> bool:
        """ロック状態確認"""
        if not self.lock_file.exists():
            return False
        
        try:
            with open(self.lock_file, 'r+') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                return False  # ロック取得できた = ロックされていない
        except IOError:
            return True  # ロック取得失敗 = ロックされている
        except Exception:
            return False
    
    def get_lock_info(self) -> Dict[str, Any]:
        """ロック情報取得"""
        if not self.lock_file.exists():
            return {"locked": False}
        
        try:
            with open(self.lock_file, 'r') as f:
                content = f.read()
                return {
                    "locked": self.is_locked(),
                    "lock_info": content,
                    "lock_file": str(self.lock_file)
                }
        except Exception as e:
            return {"locked": False, "error": str(e)}
