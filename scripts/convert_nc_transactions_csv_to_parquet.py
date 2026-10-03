#!/usr/bin/env python3
"""
Convert a North Carolina campaign-finance transaction CSV into the 4 Parquet files
required by the app:
  - filers.parquet
  - contributions_2020.parquet
  - expenditures.parquet
  - reports.parquet

Designed to handle CSV columns like:
Name, Street Line 1, Street Line 2, City, State, Zip Code,
Profession/Job Title, Employer's Name/Specific Field, Transaction Type,
Committee Name, Committee SBoE ID, Committee Street 1, Committee Street 2,
Committee City, Committee State, Committee Zip Code, Report Name,
Date Occured, Account Code, Amount, Form of Payment, Purpose
"""

from __future__ import annotations

import argparse
import json
import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import pandas as pd


CONTRIBUTION_KEYWORDS = {
    "contribution",
    "donation",
    "receipt",
    "received",
    "in-kind",
    "inkind",
    "loan received",
}

EXPENDITURE_KEYWORDS = {
    "expenditure",
    "disbursement",
    "expense",
    "payment",
    "refund",
    "reimburse",
    "reimbursement",
    "transfer out",
    "debit",
}


def normalize_header(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", header.strip().lower())


def build_column_lookup(columns: Iterable[str]) -> Dict[str, str]:
    return {normalize_header(column): column for column in columns}


def find_column(column_lookup: Dict[str, str], *candidates: str) -> Optional[str]:
    for candidate in candidates:
        key = normalize_header(candidate)
        if key in column_lookup:
            return column_lookup[key]
    return None


def require_column(column_lookup: Dict[str, str], *candidates: str) -> str:
    found = find_column(column_lookup, *candidates)
    if found is None:
        raise ValueError(f"Missing required column. Expected one of: {', '.join(candidates)}")
    return found


def parse_raw_date(value: object) -> int:
    if value is None:
        return 0
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none"}:
        return 0

    if re.fullmatch(r"\d{8}", text):
        return int(text)

    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%m-%d-%Y", "%m-%d-%y"):
        try:
            dt = datetime.strptime(text, fmt)
            return int(dt.strftime("%Y%m%d"))
        except ValueError:
            pass

    try:
        dt = pd.to_datetime(text, errors="raise")
        return int(dt.strftime("%Y%m%d"))
    except Exception:
        return 0


# Typos in the source (e.g. a year of 9896) parse fine but are impossible; treat them as unknown (0).
LATEST_PLAUSIBLE_DATE = (datetime.now().year + 1) * 10000 + 1231


def parse_date_to_int(value: object) -> int:
    date_int = parse_raw_date(value)
    return date_int if 19000101 <= date_int <= LATEST_PLAUSIBLE_DATE else 0


def parse_amount(value: object) -> float:
    if value is None:
        return 0.0
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none"}:
        return 0.0

    negative = text.startswith("(") and text.endswith(")")
    cleaned = re.sub(r"[^0-9.\-]", "", text)
    if cleaned in {"", "-", "."}:
        return 0.0

    try:
        amount = float(cleaned)
        return -abs(amount) if negative else amount
    except ValueError:
        return 0.0


def normalize_zip(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none"}:
        return ""
    digits = re.sub(r"\D", "", text)
    return digits[:5]


def classify_transaction_type(value: object) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return "contribution"

    if any(keyword in text for keyword in EXPENDITURE_KEYWORDS):
        return "expenditure"
    if any(keyword in text for keyword in CONTRIBUTION_KEYWORDS):
        return "contribution"

    return "contribution"


def infer_contributor_type(name: str) -> str:
    if not name:
        return ""
    upper_name = name.upper()
    entity_tokens = [" LLC", " INC", " CORP", " COMPANY", " CO.", " PAC", " COMMITTEE", " ASSOCIATION", " FOUNDATION"]
    return "ENTITY" if any(token in upper_name for token in entity_tokens) else "INDIVIDUAL"


def stable_hash(*values: object, length: int = 20) -> str:
    joined = "|".join(str(v or "") for v in values)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()[:length]


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "none"}:
        return ""
    return text


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert NC campaign CSV to app-compatible Parquet files.")
    parser.add_argument("--input", required=True, help="Path to source CSV file")
    parser.add_argument("--output-dir", default="public/parquet", help="Output directory for parquet files")
    parser.add_argument("--min-year", type=int, default=2020, help="Minimum year for contributions_2020 output")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {input_path}")

    df = pd.read_csv(input_path, dtype=str, keep_default_na=False)
    if df.empty:
        raise ValueError("Input CSV has no rows")

    col_lookup = build_column_lookup(df.columns)

    name_col = require_column(col_lookup, "Name")
    city_col = find_column(col_lookup, "City")
    state_col = find_column(col_lookup, "State")
    zip_col = find_column(col_lookup, "Zip Code", "Zip")
    occupation_col = find_column(col_lookup, "Profession/Job Title", "Profession", "Job Title")
    employer_col = find_column(col_lookup, "Employer's Name/Specific Field", "Employer", "Employer Name")

    transaction_type_col = require_column(col_lookup, "Transaction Type", "Transction Type")
    committee_name_col = require_column(col_lookup, "Committee Name")
    committee_id_col = find_column(col_lookup, "Committee SBoE ID", "Committee SBOE ID", "Committee ID")
    committee_city_col = find_column(col_lookup, "Committee City")
    committee_state_col = find_column(col_lookup, "Committee State")

    report_name_col = find_column(col_lookup, "Report Name")
    date_col = require_column(col_lookup, "Date Occured", "Date Occurred", "Date")
    account_code_col = find_column(col_lookup, "Account Code")
    amount_col = require_column(col_lookup, "Amount")
    purpose_col = find_column(col_lookup, "Purpose")

    working = pd.DataFrame()
    working["name"] = df[name_col].map(normalize_text)
    working["city"] = df[city_col].map(normalize_text) if city_col else ""
    working["state"] = (df[state_col].map(normalize_text).str.upper() if state_col else "")
    working["zip"] = df[zip_col].map(normalize_zip) if zip_col else ""
    working["occupation"] = df[occupation_col].map(normalize_text) if occupation_col else ""
    working["employer"] = df[employer_col].map(normalize_text) if employer_col else ""
    working["transaction_type_raw"] = df[transaction_type_col].map(normalize_text)
    working["transaction_kind"] = working["transaction_type_raw"].map(classify_transaction_type)
    working["committee_name"] = df[committee_name_col].map(normalize_text)

    if committee_id_col:
        committee_ids = df[committee_id_col].map(normalize_text)
        # Placeholders such as "---" are not real IDs; treat them as missing.
        committee_ids = committee_ids.where(committee_ids.str.contains(r"[A-Za-z0-9]", regex=True), "")
    else:
        committee_ids = pd.Series([""] * len(df))

    # Committees without an SBoE ID get a stable ID derived from their name, so all of a
    # committee's rows share one filer (hashing the row index would make one filer per row).
    working["filer_id"] = [
        committee_ids.iloc[i] if committee_ids.iloc[i] else f"FILER_{stable_hash(working['committee_name'].iloc[i])}"
        for i in range(len(working))
    ]

    working["committee_city"] = df[committee_city_col].map(normalize_text) if committee_city_col else ""
    working["committee_state"] = (df[committee_state_col].map(normalize_text).str.upper() if committee_state_col else "")
    working["report_name"] = df[report_name_col].map(normalize_text) if report_name_col else ""
    working["date"] = df[date_col].map(parse_date_to_int)
    working["account_code"] = df[account_code_col].map(normalize_text) if account_code_col else ""
    working["amount"] = df[amount_col].map(parse_amount)
    working["purpose"] = df[purpose_col].map(normalize_text) if purpose_col else ""

    working = working[working["filer_id"] != ""].copy()

    filers = (
        working[["filer_id", "committee_name", "committee_city", "committee_state"]]
        .drop_duplicates()
        .rename(columns={
            "filer_id": "id",
            "committee_name": "name",
            "committee_city": "city",
            "committee_state": "state",
        })
    )
    filers["type"] = "CANDIDATE_COMMITTEE"
    filers["party"] = ""
    filers["office_held"] = ""
    filers["office_sought"] = ""
    filers["office_district"] = ""
    filers["status"] = "ACTIVE"
    filers = filers[["id", "name", "type", "party", "office_held", "office_sought", "office_district", "city", "state", "status"]]

    contrib_rows = working[working["transaction_kind"] == "contribution"].copy()
    contrib_rows = contrib_rows[contrib_rows["date"] >= (args.min_year * 10000)]
    contrib_rows["contribution_id"] = [
        f"CONTRIB_{stable_hash(contrib_rows['filer_id'].iloc[i], contrib_rows['name'].iloc[i], contrib_rows['date'].iloc[i], contrib_rows['amount'].iloc[i], i)}"
        for i in range(len(contrib_rows))
    ]
    contrib_rows["filer_name"] = contrib_rows["committee_name"]
    contrib_rows["contributor_name"] = contrib_rows["name"]
    contrib_rows["contributor_type"] = contrib_rows["name"].map(infer_contributor_type)
    contrib_rows["contributor_city"] = contrib_rows["city"]
    contrib_rows["contributor_state"] = contrib_rows["state"]
    contrib_rows["contributor_zip"] = contrib_rows["zip"]
    contrib_rows["contributor_employer"] = contrib_rows["employer"]
    contrib_rows["contributor_occupation"] = contrib_rows["occupation"]
    contrib_rows["received_date"] = contrib_rows["date"]
    contrib_rows["description"] = contrib_rows["purpose"]

    contributions = contrib_rows[[
        "contribution_id",
        "filer_id",
        "filer_name",
        "contributor_name",
        "contributor_type",
        "contributor_city",
        "contributor_state",
        "contributor_zip",
        "contributor_employer",
        "contributor_occupation",
        "amount",
        "date",
        "received_date",
        "description",
    ]]

    expend_rows = working[working["transaction_kind"] == "expenditure"].copy()
    expend_rows["expenditure_id"] = [
        f"EXPEND_{stable_hash(expend_rows['filer_id'].iloc[i], expend_rows['name'].iloc[i], expend_rows['date'].iloc[i], expend_rows['amount'].iloc[i], i)}"
        for i in range(len(expend_rows))
    ]
    expend_rows["filer_name"] = expend_rows["committee_name"]
    expend_rows["payee_name"] = expend_rows["name"]
    expend_rows["payee_city"] = expend_rows["city"]
    expend_rows["payee_state"] = expend_rows["state"]
    expend_rows["payee_zip"] = expend_rows["zip"]
    expend_rows["received_date"] = expend_rows["date"]
    expend_rows["category"] = expend_rows["purpose"].where(expend_rows["purpose"] != "", "UNKNOWN")
    expend_rows["category_code"] = expend_rows["account_code"]
    expend_rows["description"] = expend_rows["purpose"]

    expenditures = expend_rows[[
        "expenditure_id",
        "filer_id",
        "filer_name",
        "payee_name",
        "payee_city",
        "payee_state",
        "payee_zip",
        "amount",
        "date",
        "received_date",
        "category",
        "category_code",
        "description",
    ]]

    report_base = working.copy()
    report_base["report_name_norm"] = report_base["report_name"].where(report_base["report_name"] != "", "UNSPECIFIED_REPORT")
    report_base["report_id"] = [
        f"RPT_{stable_hash(report_base['filer_id'].iloc[i], report_base['report_name_norm'].iloc[i], report_base['date'].iloc[i])}"
        for i in range(len(report_base))
    ]

    report_agg = report_base.groupby(["report_id", "filer_id", "committee_name", "report_name_norm"], as_index=False).agg(
        period_start=("date", "min"),
        period_end=("date", "max"),
        filed_date=("date", "max"),
        received_date=("date", "max"),
    )

    contrib_sums = report_base[report_base["transaction_kind"] == "contribution"].groupby("report_id", as_index=False).agg(
        total_contributions=("amount", "sum")
    )
    expend_sums = report_base[report_base["transaction_kind"] == "expenditure"].groupby("report_id", as_index=False).agg(
        total_expenditures=("amount", "sum")
    )

    reports = report_agg.merge(contrib_sums, on="report_id", how="left").merge(expend_sums, on="report_id", how="left")
    reports["filer_name"] = reports["committee_name"]
    reports["form_type"] = reports["report_name_norm"]
    reports["total_contributions"] = reports["total_contributions"].fillna(0.0)
    reports["total_expenditures"] = reports["total_expenditures"].fillna(0.0)
    reports["cash_on_hand"] = 0.0
    reports["loan_balance"] = 0.0

    reports = reports[[
        "report_id",
        "filer_id",
        "filer_name",
        "form_type",
        "period_start",
        "period_end",
        "filed_date",
        "received_date",
        "total_contributions",
        "total_expenditures",
        "cash_on_hand",
        "loan_balance",
    ]]

    # Ensure required dtypes/cleaning for numeric fields
    for frame, numeric_cols in [
        (contributions, ["amount", "date", "received_date"]),
        (expenditures, ["amount", "date", "received_date"]),
        (reports, ["period_start", "period_end", "filed_date", "received_date", "total_contributions", "total_expenditures", "cash_on_hand", "loan_balance"]),
    ]:
        for col in numeric_cols:
            frame[col] = pd.to_numeric(frame[col], errors="coerce").fillna(0)

    filers.to_parquet(output_dir / "filers.parquet", index=False, compression="zstd")
    contributions.to_parquet(output_dir / "contributions_2020.parquet", index=False, compression="zstd")
    expenditures.to_parquet(output_dir / "expenditures.parquet", index=False, compression="zstd")
    reports.to_parquet(output_dir / "reports.parquet", index=False, compression="zstd")

    print("Generated Parquet files:")
    print(f"  {output_dir / 'filers.parquet'} ({len(filers)} rows)")
    print(f"  {output_dir / 'contributions_2020.parquet'} ({len(contributions)} rows)")
    print(f"  {output_dir / 'expenditures.parquet'} ({len(expenditures)} rows)")
    print(f"  {output_dir / 'reports.parquet'} ({len(reports)} rows)")

    # Row counts shown on the home page; served next to the parquet files.
    stats = {
        "contributions": len(contributions),
        "expenditures": len(expenditures),
        "filers": len(filers),
        "reports": len(reports),
    }
    (output_dir / "stats.json").write_text(json.dumps(stats))


if __name__ == "__main__":
    main()
