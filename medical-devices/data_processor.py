#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dashboard Data Processor
Converts original Excel format to normalized structure (Excel + JSON)
"""

import pandas as pd
import json
import os
from pathlib import Path
from datetime import datetime

class DashboardDataProcessor:
    def __init__(self, source_file):
        self.source_file = source_file
        self.data = {}
        self.equipment_list = []

    def parse_budget_cell(self, cell_value):
        """Parse budget cell like '2564=1,263,800' to dict"""
        if not cell_value or pd.isna(cell_value):
            return {}

        cell_str = str(cell_value).strip()
        result = {}

        # Split by '=' if exists
        if '=' in cell_str:
            parts = cell_str.split('=')
            fiscal_year = parts[0].strip()
            amount_str = parts[1].strip().replace(',', '')
            try:
                amount = float(amount_str)
                result = {
                    'fiscal_year': fiscal_year,
                    'amount': amount
                }
            except:
                pass

        return result

    def process(self):
        """Process all sheets from Excel"""
        print("🔍 Processing Excel file...")

        # Read all sheets
        xls = pd.ExcelFile(self.source_file)
        districts = xls.sheet_names

        print(f"📍 Found {len(districts)} districts: {', '.join(districts)}")

        for district_idx, district_name in enumerate(districts):
            print(f"\n  [{district_idx + 1}/{len(districts)}] Processing: {district_name}")
            self.process_district(district_name)

        print("\n✅ Processing completed!")
        return self.data

    def process_district(self, district_name):
        """Process single district sheet"""
        df = pd.read_excel(self.source_file, sheet_name=district_name, header=None)

        # Get headers (row 0)
        headers = df.iloc[0].tolist()
        equipment_names = headers[2:]  # Skip หน่วยงาน and ปีงบประมาณ

        # Store equipment list (unique per district)
        if not self.equipment_list:
            self.equipment_list = [h for h in equipment_names if h]

        units = []
        current_unit = None

        # Process data rows
        for idx in range(1, len(df)):
            row = df.iloc[idx].tolist()
            unit_name = row[0]
            budget_info = row[1]
            equipment_data = row[2:]

            # Check if this is a new unit (Col A has value)
            if unit_name and not pd.isna(unit_name):
                # Save previous unit if exists
                if current_unit:
                    units.append(current_unit)

                current_unit = {
                    'unit_name': str(unit_name).strip(),
                    'budgets': [],
                    'equipment_records': []
                }

            # Parse budget/summary row
            if budget_info and not pd.isna(budget_info):
                budget_str = str(budget_info).strip()

                # Check if it's a summary row
                if budget_str in ['รวม', 'ชำรุด', 'ใช้งานอยู่', 'คงเหลือ']:
                    # Summary row
                    summary_record = {
                        'type': budget_str,
                        'equipment_values': {}
                    }

                    for col_idx, equip_name in enumerate(equipment_names):
                        if equip_name and not pd.isna(equip_name):
                            value = equipment_data[col_idx]
                            if value and not pd.isna(value):
                                try:
                                    summary_record['equipment_values'][equip_name] = int(value)
                                except:
                                    pass

                    if current_unit:
                        current_unit['summaries'] = current_unit.get('summaries', {})
                        current_unit['summaries'][budget_str] = summary_record['equipment_values']

                elif '=' in budget_str:
                    # Budget record
                    budget_dict = self.parse_budget_cell(budget_str)
                    if budget_dict:
                        equipment_record = {
                            'fiscal_year': budget_dict['fiscal_year'],
                            'amount': budget_dict['amount'],
                            'equipment': {}
                        }

                        for col_idx, equip_name in enumerate(equipment_names):
                            if equip_name and not pd.isna(equip_name):
                                value = equipment_data[col_idx]
                                if value and not pd.isna(value):
                                    try:
                                        equipment_record['equipment'][equip_name] = int(value)
                                    except:
                                        pass

                        if current_unit:
                            current_unit['budgets'].append(equipment_record)

        # Add last unit
        if current_unit:
            units.append(current_unit)

        self.data[district_name] = {
            'units': units,
            'equipment_count': len(equipment_names),
            'total_units': len(units)
        }

    def save_normalized_excel(self, output_file):
        """Save normalized data to Excel"""
        print(f"\n💾 Creating normalized Excel: {output_file}")

        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            # Sheet 1: Units List
            units_data = []
            for district, district_data in self.data.items():
                for unit in district_data['units']:
                    units_data.append({
                        'District': district,
                        'Unit': unit['unit_name'],
                        'Budget Count': len(unit.get('budgets', []))
                    })

            if units_data:
                pd.DataFrame(units_data).to_excel(writer, sheet_name='Units', index=False)

            # Sheet 2: Equipment List
            equipment_df = pd.DataFrame({
                'Equipment ID': range(1, len(self.equipment_list) + 1),
                'Equipment Name': self.equipment_list
            })
            equipment_df.to_excel(writer, sheet_name='Equipment', index=False)

            # Sheet 3: Budget Details
            budget_details = []
            for district, district_data in self.data.items():
                for unit in district_data['units']:
                    for budget in unit.get('budgets', []):
                        budget_details.append({
                            'District': district,
                            'Unit': unit['unit_name'],
                            'Fiscal Year': budget['fiscal_year'],
                            'Amount': budget['amount']
                        })

            if budget_details:
                pd.DataFrame(budget_details).to_excel(writer, sheet_name='Budgets', index=False)

            # Sheet 4: Summary
            summary_sheet = []
            for district, district_data in self.data.items():
                summary_sheet.append({
                    'District': district,
                    'Total Units': len(district_data['units']),
                    'Total Equipments': district_data['equipment_count']
                })

            if summary_sheet:
                pd.DataFrame(summary_sheet).to_excel(writer, sheet_name='Summary', index=False)

        print(f"  ✅ Saved: {output_file}")

    def save_json(self, output_file):
        """Save data as JSON"""
        print(f"\n💾 Creating JSON file: {output_file}")

        json_data = {
            'metadata': {
                'created_at': datetime.now().isoformat(),
                'source': os.path.basename(self.source_file),
                'districts_count': len(self.data),
                'equipment_count': len(self.equipment_list)
            },
            'equipment_list': self.equipment_list,
            'data': self.data
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)

        print(f"  ✅ Saved: {output_file}")

    def generate_report(self):
        """Generate processing report"""
        report = []
        report.append("=" * 60)
        report.append("📊 DASHBOARD DATA PROCESSING REPORT")
        report.append("=" * 60)
        report.append(f"\n📁 Source File: {self.source_file}")
        report.append(f"📅 Processed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append(f"\n📍 Districts: {len(self.data)}")

        total_units = sum(d['total_units'] for d in self.data.values())
        report.append(f"🏥 Total Units: {total_units}")
        report.append(f"🛠️ Equipment Types: {len(self.equipment_list)}")

        report.append("\n📋 Districts Details:")
        for district, data in self.data.items():
            report.append(f"  • {district}: {data['total_units']} units")

        report.append("\n" + "=" * 60)

        return "\n".join(report)


if __name__ == "__main__":
    # Define paths
    source_file = r"D:\New Dashboard\medical-devices\source\ศูนย์สาธิต 21.9.69.xlsx"
    output_dir = r"D:\New Dashboard\medical-devices\data"

    # Create processor
    processor = DashboardDataProcessor(source_file)

    # Process data
    processor.process()

    # Save outputs
    processor.save_normalized_excel(
        os.path.join(output_dir, "Dashboard_Data_Normalized.xlsx")
    )
    processor.save_json(
        os.path.join(output_dir, "dashboard_data.json")
    )

    # Print report
    print(processor.generate_report())
