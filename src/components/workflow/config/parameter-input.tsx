import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { NodeParameter } from '@/lib/workflow/node-schemas';

interface ParameterInputProps {
  param: NodeParameter;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function ParameterInput({ param, value, onChange }: ParameterInputProps) {
  switch (param.type) {
    case 'string':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={param.name}>
              {param.label} {param.required && <span className="text-destructive">*</span>}
            </Label>
          </div>
          {param.description && (
            <p className="text-xs text-muted-foreground">{param.description}</p>
          )}
          <Input
            id={param.name}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={param.placeholder}
            required={param.required}
          />
        </div>
      );
      
    case 'number':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={param.name}>
              {param.label} {param.required && <span className="text-destructive">*</span>}
            </Label>
          </div>
          {param.description && (
            <p className="text-xs text-muted-foreground">{param.description}</p>
          )}
          <Input
            id={param.name}
            type="number"
            value={(value as number) || ''}
            onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder={param.placeholder}
            required={param.required}
          />
        </div>
      );
      
    case 'boolean':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor={param.name}>{param.label}</Label>
              {param.description && (
                <p className="text-xs text-muted-foreground mt-1">{param.description}</p>
              )}
            </div>
            <Switch 
              id={param.name}
              checked={(value as boolean) ?? (param.default as boolean) ?? false}
              onCheckedChange={onChange}
            />
          </div>
        </div>
      );
      
    case 'select':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={param.name}>
              {param.label} {param.required && <span className="text-destructive">*</span>}
            </Label>
          </div>
          {param.description && (
            <p className="text-xs text-muted-foreground">{param.description}</p>
          )}
          <Select
            value={(value as string) || (param.default as string)}
            onValueChange={onChange}
          >
            <SelectTrigger id={param.name}>
              <SelectValue placeholder={`Select ${param.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {param.options?.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
      
    case 'textarea':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={param.name}>
              {param.label} {param.required && <span className="text-destructive">*</span>}
            </Label>
          </div>
          {param.description && (
            <p className="text-xs text-muted-foreground">{param.description}</p>
          )}
          <Textarea
            id={param.name}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={param.placeholder}
            rows={4}
            className="font-mono text-sm"
            required={param.required}
          />
        </div>
      );
      
    default:
      return null;
  }
}
