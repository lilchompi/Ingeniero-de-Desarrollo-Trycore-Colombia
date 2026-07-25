import pytest

from backend.app.domain.evm_service import EVMService, EVMResult


def test_calculate_baseline_values():
    result = EVMService.calculate(planned_value=100.0, earned_value=90.0, actual_cost=80.0, budget_at_completion=120.0)

    assert result.pv == 100.0
    assert result.ev == 90.0
    assert result.ac == 80.0
    assert result.cv == 10.0
    assert result.sv == -10.0
    assert result.cpi == 1.125
    assert result.spi == 0.9
    assert pytest.approx(result.eac, rel=1e-6) == 106.66666666666667
    assert pytest.approx(result.vac, rel=1e-6) == 13.333333333333329


def test_calculate_handles_zero_ac():
    result = EVMService.calculate(planned_value=100.0, earned_value=90.0, actual_cost=0.0, budget_at_completion=120.0)

    assert result.cv == 90.0
    assert result.cpi is None
    assert result.eac is None
    assert result.vac is None


def test_calculate_handles_zero_pv():
    result = EVMService.calculate(planned_value=0.0, earned_value=50.0, actual_cost=25.0, budget_at_completion=100.0)

    assert result.sv == 50.0
    assert result.spi is None
    assert result.cpi == 2.0
    assert result.eac == 50.0
    assert result.vac == 50.0


@pytest.mark.parametrize(
    "planned_value, earned_value, actual_cost, budget_at_completion",
    [
        (-1.0, 10.0, 10.0, 100.0),
        (10.0, -5.0, 10.0, 100.0),
        (10.0, 10.0, -1.0, 100.0),
        (10.0, 10.0, 10.0, -50.0),
    ],
)
def test_calculate_rejects_negative_inputs(planned_value, earned_value, actual_cost, budget_at_completion):
    with pytest.raises(ValueError):
        EVMService.calculate(
            planned_value=planned_value,
            earned_value=earned_value,
            actual_cost=actual_cost,
            budget_at_completion=budget_at_completion,
        )
