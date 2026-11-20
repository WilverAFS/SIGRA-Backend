import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  check,
  email,
  Messages,
  password,
  personName,
} from '#src/common/validation/rules.ts';
import { CreateUserSchema } from '#src/entities/User/index.ts';

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //
// Reglas explícitas del 2026-11-18 (contrato 5.2): deben coincidir con las
// del frontend.

describe('Reglas de validación (5.2)', () => {
  describe('contraseña', () => {
    const rule = password();
    for (const valid of ['ClaveSegura1!', 'Ñandú2026#', 'aB3$efgh']) {
      it(`acepta "${valid}"`, () => {
        assert.equal(check(rule, valid), null);
      });
    }
    const invalid = {
      'menos de 8 caracteres': 'Ab1!xyz',
      'sin mayúscula': 'clavesegura1!',
      'sin minúscula': 'CLAVESEGURA1!',
      'sin número': 'ClaveSegura!',
      'sin símbolo (ejemplo viejo del contrato)': 'ClaveSegura1',
    };
    for (const [reason, value] of Object.entries(invalid)) {
      it(`rechaza una contraseña ${reason}`, () => {
        assert.equal(check(rule, value), Messages.PASSWORD);
      });
    }
    it('marca como obligatorio el campo ausente', () => {
      assert.equal(check(rule, undefined), Messages.REQUIRED);
    });
  });

  describe('nombres y apellidos', () => {
    const rule = personName(100);
    for (const valid of [
      'Wilver Alfredo',
      'José Ñúñez',
      'Güereña',
      'María de la Luz',
    ]) {
      it(`acepta "${valid}"`, () => {
        assert.equal(check(rule, valid), null);
      });
    }
    const invalid = {
      'con números': 'Juan 2',
      'con guion': 'Ana-María',
      'con apóstrofo': "O'Connor",
      'con espacios dobles': 'Juan  Pérez',
      'con símbolos': 'Juan!',
    };
    for (const [reason, value] of Object.entries(invalid)) {
      it(`rechaza un nombre ${reason}`, () => {
        assert.equal(check(rule, value), Messages.ONLY_LETTERS);
      });
    }
    it('quita espacios al inicio y al final', () => {
      assert.equal(rule.parse('  Kelly  '), 'Kelly');
    });
    it('rechaza el texto vacío como obligatorio', () => {
      assert.equal(check(rule, '   '), Messages.REQUIRED);
    });
  });

  describe('correo', () => {
    const rule = email();
    it('acepta un correo válido y lo normaliza a minúsculas', () => {
      assert.equal(
        rule.parse(' Usuario@ITOaxaca.edu.mx '),
        'usuario@itoaxaca.edu.mx',
      );
    });
    for (const value of [
      'usuario',
      'usuario@',
      '@itoaxaca.edu.mx',
      'a b@c.mx',
    ]) {
      it(`rechaza "${value}"`, () => {
        assert.equal(check(rule, value), Messages.EMAIL);
      });
    }
  });

  describe('CreateUserRequest', () => {
    const valid = {
      institutionalId: '22161058',
      firstName: 'Wilver Alfredo',
      lastName: 'Flores Santiago',
      email: 'usuario@itoaxaca.edu.mx',
      password: 'ClaveSegura1!',
      role: 'DOCENTE',
      instituteId: 1,
      careerId: 1,
    };
    it('acepta el ejemplo del contrato (5.5.5)', () => {
      assert.equal(CreateUserSchema.safeParse(valid).success, true);
    });
    it('exige careerId salvo para ADMIN', () => {
      const { careerId: _c, ...withoutCareer } = valid;
      assert.equal(CreateUserSchema.safeParse(withoutCareer).success, false);
      assert.equal(
        CreateUserSchema.safeParse({ ...withoutCareer, role: 'ADMIN' }).success,
        true,
      );
    });
    it('ignora los campos de solo lectura enviados por el cliente', () => {
      const parsed = CreateUserSchema.parse({
        ...valid,
        id: 99,
        createdAt: 'x',
      });
      assert.equal('id' in parsed, false);
      assert.equal('createdAt' in parsed, false);
    });
  });
});
