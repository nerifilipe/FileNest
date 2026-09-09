"""One bounded in-memory analysis job; document-boundary cancellation."""
from threading import Lock, Thread
from uuid import uuid4

from fastapi import HTTPException


class AnalysisJobs:
    def __init__(self):
        self.lock = Lock()
        self.job = None

    def start(self, callback):
        with self.lock:
            if self.job and self.job["status"] == "running":
                raise HTTPException(409, "An analysis is already running. Wait or cancel it.")
            job = {"id": uuid4().hex, "status": "running", "completed": 0, "total": None,
                   "current": "", "cancel_requested": False, "plan": None, "error": ""}
            self.job = job
            initial = dict(job)

        def update(**changes):
            with self.lock:
                job.update(changes)
                return job["cancel_requested"]

        def work():
            try:
                plan = callback(update)
                with self.lock:
                    job.update(plan=plan.model_dump(), current="", status="cancelled" if job["cancel_requested"] else "completed")
            except Exception as error:
                with self.lock:
                    job.update(status="failed", current="", error=error.detail if isinstance(error, HTTPException) else "Analysis failed. Check the folder and try again.")

        Thread(target=work, daemon=True, name="filenest-analysis").start()
        return initial

    def snapshot(self, job_id, cancel=False):
        with self.lock:
            if not self.job or self.job["id"] != job_id:
                raise HTTPException(404, "This analysis is no longer available. Analyze the folder again.")
            if cancel and self.job["status"] == "running":
                self.job["cancel_requested"] = True
            return dict(self.job)


jobs = AnalysisJobs()
