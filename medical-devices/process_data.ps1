# Dashboard Data Processor - PowerShell Version
# Converts original Excel to normalized format

param(
    [string]$SourceFile = "D:\New Dashboard\medical-devices\source\ศูนย์สาธิต 21.9.69.xlsx"
)

function Parse-BudgetCell {
    param([string]$cellValue)

    if ([string]::IsNullOrWhiteSpace($cellValue)) {
        return $null
    }

    if ($cellValue -match '^(\d+)=(.+)$') {
        $fiscalYear = $matches[1]
        $amount = $matches[2].Replace(',', '')

        try {
            $amountNum = [decimal]::Parse($amount)
            return @{
                'fiscal_year' = $fiscalYear
                'amount' = $amountNum
            }
        } catch {
            return $null
        }
    }

    return $null
}

function Process-ExcelData {
    param([string]$filePath)

    Write-Host "Processing Excel file..." -ForegroundColor Cyan

    $Excel = New-Object -ComObject Excel.Application
    $Excel.Visible = $false
    $Excel.DisplayAlerts = $false

    $Workbook = $Excel.Workbooks.Open($filePath)

    $allData = @{}
    $equipmentList = @()

    # Process each sheet (district)
    for ($sheetIdx = 1; $sheetIdx -le $Workbook.Sheets.Count; $sheetIdx++) {
        $Sheet = $Workbook.Sheets.Item($sheetIdx)
        $districtName = $Sheet.Name

        Write-Host "  Processing: $districtName" -ForegroundColor Green

        # Read data
        $usedRange = $Sheet.UsedRange
        $rows = $usedRange.Rows.Count
        $cols = $usedRange.Columns.Count

        # Get headers
        $headers = @()
        for ($col = 1; $col -le $cols; $col++) {
            $header = $Sheet.Cells.Item(1, $col).Value2
            $headers += $header
        }

        # Store equipment list (first district)
        if ($equipmentList.Count -eq 0) {
            for ($col = 3; $col -le $cols; $col++) {
                $equip = $headers[$col - 1]
                if (-not [string]::IsNullOrWhiteSpace($equip)) {
                    $equipmentList += $equip
                }
            }
        }

        # Process rows
        $units = @()
        $currentUnit = $null

        for ($row = 2; $row -le $rows; $row++) {
            $unitName = $Sheet.Cells.Item($row, 1).Value2
            $budgetInfo = $Sheet.Cells.Item($row, 2).Value2

            # New unit
            if (-not [string]::IsNullOrWhiteSpace($unitName)) {
                if ($currentUnit) {
                    $units += $currentUnit
                }

                $currentUnit = @{
                    'unit_name' = [string]$unitName
                    'budgets' = @()
                    'summaries' = @{}
                }
            }

            # Parse budget/summary row
            if (-not [string]::IsNullOrWhiteSpace($budgetInfo) -and $currentUnit) {
                $budgetStr = [string]$budgetInfo

                # Check if summary row
                if ($budgetStr -in @('รวม', 'ชำรุด', 'ใช้งานอยู่', 'คงเหลือ')) {
                    $summaryValues = @{}

                    for ($col = 3; $col -le $cols; $col++) {
                        $equipName = $headers[$col - 1]
                        $value = $Sheet.Cells.Item($row, $col).Value2

                        if (-not [string]::IsNullOrWhiteSpace($equipName) -and $value) {
                            try {
                                $summaryValues[$equipName] = [int]$value
                            } catch {}
                        }
                    }

                    $currentUnit.summaries[$budgetStr] = $summaryValues
                }
                elseif ($budgetStr -match '^(\d+)=') {
                    # Budget record
                    $budgetParsed = Parse-BudgetCell $budgetStr

                    if ($budgetParsed) {
                        $equipmentRecord = @{
                            'fiscal_year' = $budgetParsed.fiscal_year
                            'amount' = $budgetParsed.amount
                            'equipment' = @{}
                        }

                        for ($col = 3; $col -le $cols; $col++) {
                            $equipName = $headers[$col - 1]
                            $value = $Sheet.Cells.Item($row, $col).Value2

                            if (-not [string]::IsNullOrWhiteSpace($equipName) -and $value) {
                                try {
                                    $equipmentRecord.equipment[$equipName] = [int]$value
                                } catch {}
                            }
                        }

                        $currentUnit.budgets += $equipmentRecord
                    }
                }
            }
        }

        # Add last unit
        if ($currentUnit) {
            $units += $currentUnit
        }

        $allData[$districtName] = @{
            'units' = $units
            'equipment_count' = $equipmentList.Count
            'total_units' = $units.Count
        }
    }

    $Workbook.Close($false)
    $Excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($Excel) | Out-Null

    return @{
        'data' = $allData
        'equipment_list' = $equipmentList
    }
}

function Export-NormalizedExcel {
    param($ProcessedData, [string]$OutputFile)

    Write-Host "Creating Normalized Excel..." -ForegroundColor Cyan

    $Excel = New-Object -ComObject Excel.Application
    $Excel.Visible = $false
    $Excel.DisplayAlerts = $false

    $Workbook = $Excel.Workbooks.Add()

    # Remove default sheet
    $Workbook.Sheets(1).Delete()

    # Sheet 1: Summary
    $SummarySheet = $Workbook.Sheets.Add()
    $SummarySheet.Name = "Summary"
    $SummarySheet.Cells.Item(1, 1) = "District"
    $SummarySheet.Cells.Item(1, 2) = "Total Units"
    $SummarySheet.Cells.Item(1, 3) = "Equipment Types"

    $row = 2
    foreach ($district in $ProcessedData.data.Keys) {
        $districtData = $ProcessedData.data[$district]
        $SummarySheet.Cells.Item($row, 1) = $district
        $SummarySheet.Cells.Item($row, 2) = $districtData.total_units
        $SummarySheet.Cells.Item($row, 3) = $districtData.equipment_count
        $row++
    }

    # Sheet 2: Units
    $UnitsSheet = $Workbook.Sheets.Add()
    $UnitsSheet.Name = "Units"
    $UnitsSheet.Cells.Item(1, 1) = "District"
    $UnitsSheet.Cells.Item(1, 2) = "Unit Name"
    $UnitsSheet.Cells.Item(1, 3) = "Budget Records"

    $row = 2
    foreach ($district in $ProcessedData.data.Keys) {
        foreach ($unit in $ProcessedData.data[$district].units) {
            $UnitsSheet.Cells.Item($row, 1) = $district
            $UnitsSheet.Cells.Item($row, 2) = $unit.unit_name
            $UnitsSheet.Cells.Item($row, 3) = $unit.budgets.Count
            $row++
        }
    }

    # Sheet 3: Equipment List
    $EquipSheet = $Workbook.Sheets.Add()
    $EquipSheet.Name = "Equipment"
    $EquipSheet.Cells.Item(1, 1) = "Equipment ID"
    $EquipSheet.Cells.Item(1, 2) = "Equipment Name"

    $row = 2
    foreach ($equip in $ProcessedData.equipment_list) {
        $EquipSheet.Cells.Item($row, 1) = $row - 1
        $EquipSheet.Cells.Item($row, 2) = $equip
        $row++
    }

    # Auto-fit columns
    foreach ($sheet in $Workbook.Sheets) {
        $sheet.UsedRange.Columns.AutoFit() | Out-Null
    }

    $Workbook.SaveAs($OutputFile)
    $Workbook.Close($false)
    $Excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($Excel) | Out-Null

    Write-Host "  OK: $OutputFile"
}

function Export-JSON {
    param($ProcessedData, [string]$OutputFile)

    Write-Host "Creating JSON file..." -ForegroundColor Cyan

    $JsonData = @{
        'metadata' = @{
            'created_at' = (Get-Date).ToString('o')
            'source' = (Split-Path $SourceFile -Leaf)
            'districts_count' = $ProcessedData.data.Count
            'equipment_count' = $ProcessedData.equipment_list.Count
        }
        'equipment_list' = $ProcessedData.equipment_list
        'data' = $ProcessedData.data
    } | ConvertTo-Json -Depth 10

    $JsonData | Out-File -FilePath $OutputFile -Encoding UTF8

    Write-Host "  OK: $OutputFile"
}

# Main execution
Write-Host ""
Write-Host "==== DASHBOARD DATA PROCESSOR ====" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $SourceFile)) {
    Write-Host "ERROR: Source file not found: $SourceFile" -ForegroundColor Red
    exit 1
}

$OutputDir = Join-Path (Split-Path (Split-Path $SourceFile)) "data"
$NormalizedExcelFile = Join-Path $OutputDir "Dashboard_Data_Normalized.xlsx"
$JsonFile = Join-Path $OutputDir "dashboard_data.json"

# Process
$processedData = Process-ExcelData $SourceFile

# Export
Export-NormalizedExcel $processedData $NormalizedExcelFile
Export-JSON $processedData $JsonFile

# Report
Write-Host ""
Write-Host "==== COMPLETED ====" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:"
$totalUnits = ($processedData.data.Values | Measure-Object -Property total_units -Sum).Sum
Write-Host "  Districts: $($processedData.data.Count)"
Write-Host "  Total Units: $totalUnits"
Write-Host "  Equipment Types: $($processedData.equipment_list.Count)"
Write-Host ""
Write-Host "Output Files:"
Write-Host "  - $NormalizedExcelFile"
Write-Host "  - $JsonFile"
Write-Host ""
