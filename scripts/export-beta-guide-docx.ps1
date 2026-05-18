Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$sourcePath = 'C:\LucidMerged\docs\BETA_TESTER_GUIDE.md'
$outputPath = 'C:\LucidMerged\docs\BETA_TESTER_GUIDE.docx'
$tempDir = Join-Path $env:TEMP ('lucid-docx-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempDir | Out-Null

function Escape-Xml([string]$text) {
  if ($null -eq $text) { return '' }
  return [System.Security.SecurityElement]::Escape($text)
}

function New-Paragraph([string]$text, [string]$style = $null, [switch]$Bullet) {
  $escaped = Escape-Xml $text
  $pPr = ''
  if ($style) {
    $pPr += "<w:pStyle w:val=""$style""/>"
  }
  if ($Bullet) {
    $pPr += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
  }
  if ($pPr) {
    $pPr = "<w:pPr>$pPr</w:pPr>"
  }
  if ([string]::IsNullOrWhiteSpace($text)) {
    return "<w:p>$pPr</w:p>"
  }
  return "<w:p>$pPr<w:r><w:t xml:space=""preserve"">$escaped</w:t></w:r></w:p>"
}

$lines = Get-Content -LiteralPath $sourcePath
$body = New-Object System.Collections.Generic.List[string]
$inOrderedList = $false
$orderedIndex = 0

foreach ($line in $lines) {
  if ($line -match '^# (.+)$') {
    $body.Add((New-Paragraph $matches[1] 'Title'))
    $inOrderedList = $false
    $orderedIndex = 0
    continue
  }
  if ($line -match '^## (.+)$') {
    $body.Add((New-Paragraph $matches[1] 'Heading1'))
    $inOrderedList = $false
    $orderedIndex = 0
    continue
  }
  if ($line -match '^### (.+)$') {
    $body.Add((New-Paragraph $matches[1] 'Heading2'))
    $inOrderedList = $false
    $orderedIndex = 0
    continue
  }
  if ($line -match '^#### (.+)$') {
    $body.Add((New-Paragraph $matches[1] 'Heading3'))
    $inOrderedList = $false
    $orderedIndex = 0
    continue
  }
  if ($line -match '^- (.+)$') {
    $body.Add((New-Paragraph $matches[1] $null -Bullet))
    $inOrderedList = $false
    $orderedIndex = 0
    continue
  }
  if ($line -match '^[0-9]+\. (.+)$') {
    if (-not $inOrderedList) {
      $orderedIndex = 0
      $inOrderedList = $true
    }
    $orderedIndex++
    $body.Add((New-Paragraph ("$orderedIndex. " + $matches[1]) 'ListParagraph'))
    continue
  }
  if ([string]::IsNullOrWhiteSpace($line)) {
    $body.Add((New-Paragraph ''))
    $inOrderedList = $false
    $orderedIndex = 0
    continue
  }

  $inOrderedList = $false
  $orderedIndex = 0
  $body.Add((New-Paragraph $line 'BodyText'))
}

$sect = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    $($body -join "`n    ")
    $sect
  </w:body>
</w:document>
"@

$stylesXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault/>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:pPr><w:spacing w:after="240"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:pPr><w:spacing w:before="180" w:after="80"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:spacing w:after="60"/></w:pPr></w:style>
</w:styles>
"@

$numberingXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>
"@

$contentTypesXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"@

$rootRelsXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"@

$docRelsXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>
"@

$now = [DateTime]::UtcNow.ToString('s') + 'Z'
$coreXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Lucid Beta Tester Guide</dc:title>
  <dc:creator>OpenAI Codex</dc:creator>
  <cp:lastModifiedBy>OpenAI Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">$now</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">$now</dcterms:modified>
</cp:coreProperties>
"@

$appXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Title</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>1</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr">
      <vt:lpstr>Document</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>
"@

New-Item -ItemType Directory -Path (Join-Path $tempDir '_rels') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir 'docProps') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir 'word') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempDir 'word\_rels') | Out-Null

Set-Content -LiteralPath (Join-Path $tempDir '[Content_Types].xml') -Value $contentTypesXml -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tempDir '_rels\.rels') -Value $rootRelsXml -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tempDir 'docProps\core.xml') -Value $coreXml -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tempDir 'docProps\app.xml') -Value $appXml -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tempDir 'word\document.xml') -Value $documentXml -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tempDir 'word\styles.xml') -Value $stylesXml -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tempDir 'word\numbering.xml') -Value $numberingXml -Encoding UTF8
Set-Content -LiteralPath (Join-Path $tempDir 'word\_rels\document.xml.rels') -Value $docRelsXml -Encoding UTF8

if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}

[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $outputPath)
Remove-Item -LiteralPath $tempDir -Recurse -Force
Write-Output $outputPath
