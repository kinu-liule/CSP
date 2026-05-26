from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import uvicorn
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import json

app = FastAPI(title="Risk Engine", version="1.0.0")

DB_URL = os.getenv("DATABASE_URL", "postgresql://cybersec:securepassword@postgres:5432/cybersec_platform")

class RiskRequest(BaseModel):
    tenant_id: str
    user_id: Optional[str] = None
    entity_id: Optional[str] = None
    event_data: Dict[Any, Any]
    factors: Optional[Dict[str, Any]] = None

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "risk-engine", "timestamp": "2026-05-05"}

@app.post("/score")
async def calculate_risk(request: RiskRequest):
    """Calculate risk score based on behavioral analysis"""
    try:
        # Simplified risk scoring logic
        base_score = 50.0
        
        # Factor in various risk indicators
        if request.factors:
            if request.factors.get("failed_logins", 0) > 3:
                base_score += 20
            if request.factors.get("vpn", False) == False:
                base_score += 10
            if request.factors.get("time_since_last_login", 0) > 30:
                base_score += 15
            if request.factors.get("ip_reputation") == "malicious":
                base_score += 30
        
        # Cap at 100
        risk_score = min(base_score, 100.0)
        
        return {
            "tenant_id": request.tenant_id,
            "risk_score": risk_score,
            "risk_level": "high" if risk_score > 70 else "medium" if risk_score > 40 else "low",
            "factors_considered": request.factors
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/batch")
async def batch_risk_assessment(requests: list[RiskRequest]):
    """Batch risk assessment"""
    results = []
    for req in requests:
        score = await calculate_risk(req)
        results.append(score)
    return {"results": results}

@app.get("/human/{user_id}")
async def get_human_risk(user_id: str, tenant_id: str):
    """Get human risk score for awareness platform"""
    import random
    return {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "risk_score": round(random.uniform(10, 90), 2),
        "contributing_factors": {
            "phishing_clicks": random.randint(0, 5),
            "training_overdue": random.choice([True, False]),
            "password_reuse": random.randint(0, 3)
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
