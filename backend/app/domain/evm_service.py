from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class EVMResult:
    pv: float
    ev: float
    ac: float
    cv: float
    sv: float
    cpi: Optional[float]
    spi: Optional[float]
    eac: Optional[float]
    vac: Optional[float]


class EVMService:
    @staticmethod
    def calculate(
        planned_value: float,
        earned_value: float,
        actual_cost: float,
        budget_at_completion: float,
    ) -> EVMResult:
        if planned_value < 0:
            raise ValueError("planned_value must be non-negative")
        if earned_value < 0:
            raise ValueError("earned_value must be non-negative")
        if actual_cost < 0:
            raise ValueError("actual_cost must be non-negative")
        if budget_at_completion < 0:
            raise ValueError("budget_at_completion must be non-negative")

        pv = planned_value
        ev = earned_value
        ac = actual_cost

        cv = ev - ac
        sv = ev - pv

        cpi = None
        if ac != 0:
            cpi = ev / ac

        spi = None
        if pv != 0:
            spi = ev / pv

        eac = None
        vac = None
        if cpi is not None and cpi != 0:
            eac = budget_at_completion / cpi
            vac = budget_at_completion - eac

        return EVMResult(
            pv=pv,
            ev=ev,
            ac=ac,
            cv=cv,
            sv=sv,
            cpi=cpi,
            spi=spi,
            eac=eac,
            vac=vac,
        )
